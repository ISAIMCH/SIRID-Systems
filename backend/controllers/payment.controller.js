const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const mongoose = require('mongoose');
const User = require('../models/User');
const { createReceipt } = require('../services/receipt.service');

const METHODS = new Set(['stripe', 'paypal', 'paynet']);
const STATUSES = new Set(['pagado', 'pendiente']);

async function reserveStock(items) {
    const reserved = [];
    for (const item of items) {
        const result = await Plan.updateOne(
            { _id: item.productId, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity } }
        );
        if (result.matchedCount !== 1) {
            await Promise.all(reserved.map((reservedItem) => Plan.updateOne(
                { _id: reservedItem.productId },
                { $inc: { stock: reservedItem.quantity } }
            )));
            return item;
        }
        reserved.push(item);
    }
    return null;
}

function paymentResponse(payment) {
    return {
        id: payment.orderId,
        method: payment.method,
        status: payment.status,
        total: payment.total,
        items: payment.items.map((item) => ({
            productId: item.productId,
            title: item.title,
            unitPrice: item.unitPrice,
            quantity: item.quantity
        })),
        date: payment.createdAt.toISOString(),
        last4: payment.last4,
        ref: payment.reference,
        exp: payment.expiresAt?.getTime()
    };
}

async function getPayments(req, res) {
    try {
        const payments = await Payment.find({ user: req.userId }).sort({ createdAt: -1 });
        res.json({ payments: payments.map(paymentResponse) });
    } catch (error) {
        console.error('Error cargando pagos:', error.message);
        res.status(500).json({ msg: 'No se pudieron cargar tus pagos.' });
    }
}

async function createPayment(req, res) {
    try {
        const { id, method, status, subtotal, tax, total, items, last4, ref, exp } = req.body;
        if (typeof id !== 'string' || !id.trim() || !METHODS.has(method) || !STATUSES.has(status)) {
            return res.status(400).json({ msg: 'Los datos del pago no son válidos.' });
        }
        if (!Array.isArray(items) || items.length === 0 || items.some((item) => (
            typeof item.productId !== 'string' ||
            typeof item.title !== 'string' ||
            !Number.isFinite(item.unitPrice) ||
            !Number.isInteger(item.quantity) ||
            item.quantity < 1
        ))) {
            return res.status(400).json({ msg: 'La orden debe contener productos válidos.' });
        }
        if (!(await User.exists({ _id: req.userId }))) {
            return res.status(401).json({ msg: 'La sesión no pertenece a un usuario válido.' });
        }

        const catalogIds = items.map((item) => item.productId);
        if (catalogIds.some((id) => !mongoose.isValidObjectId(id))) {
            return res.status(400).json({ msg: 'El catálogo de la orden ya no es válido. Actualiza la página.' });
        }
        const plans = await Plan.find({ _id: { $in: catalogIds }, isActive: { $ne: false } }).lean();
        const plansById = new Map(plans.map((plan) => [String(plan._id), plan]));
        const normalizedItems = items.map((item) => {
            const plan = plansById.get(item.productId);
            return plan
                ? { ...item, title: plan.nombre, unitPrice: plan.precio }
                : item;
        });
        if (plans.length !== items.length) {
            return res.status(400).json({ msg: 'Uno o más productos ya no están disponibles.' });
        }
        for (const item of normalizedItems) {
            const plan = plansById.get(item.productId);
            if (plan.stock < item.quantity) return res.status(409).json({ msg: `Stock insuficiente para ${plan.nombre}.` });
        }
        const calculatedSubtotal = Number(normalizedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0).toFixed(2));
        const calculatedTax = Number((calculatedSubtotal * 0.16).toFixed(2));
        const calculatedTotal = Number((calculatedSubtotal + calculatedTax).toFixed(2));
        if (![subtotal, tax, total].every((value) => Number.isFinite(value) && value >= 0)) {
            return res.status(400).json({ msg: 'Los importes del pago no son válidos.' });
        }
        const expectedTotal = calculatedTotal;
        if (Math.abs(calculatedSubtotal - subtotal) > 0.01 || Math.abs(calculatedTax - tax) > 0.01 || Math.abs(expectedTotal - total) > 0.01) {
            return res.status(400).json({ msg: 'El total de la orden no coincide con el subtotal y el IVA.' });
        }
        if (status === 'pagado') {
            const unavailableItem = await reserveStock(normalizedItems);
            if (unavailableItem) {
                const unavailablePlan = plansById.get(unavailableItem.productId);
                return res.status(409).json({
                    msg: `Stock insuficiente para ${unavailablePlan?.nombre || unavailableItem.title}. Actualiza el carrito e inténtalo nuevamente.`
                });
            }
        }
        const payment = await Payment.create({
            orderId: id.trim(),
            user: req.userId,
            method,
            status,
            subtotal,
            tax,
            total,
            items: normalizedItems,
            last4: typeof last4 === 'string' ? last4.slice(-4) : undefined,
            reference: typeof ref === 'string' ? ref : undefined,
            expiresAt: Number.isFinite(exp) ? new Date(exp) : undefined
        });
        res.status(201).json({ payment: paymentResponse(payment) });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ msg: 'La orden ya fue registrada.' });
        console.error('Error registrando pago:', error.message);
        res.status(500).json({ msg: 'No se pudo registrar el pago.' });
    }
}

async function updatePaymentStatus(req, res) {
    try {
        if (!STATUSES.has(req.body.status)) return res.status(400).json({ msg: 'El estado del pago no es válido.' });
        const paymentBeforeUpdate = await Payment.findOne(
            { orderId: req.params.orderId, user: req.userId }
        );
        if (!paymentBeforeUpdate) return res.status(404).json({ msg: 'Orden no encontrada.' });
        if (paymentBeforeUpdate.status !== 'pagado' && req.body.status === 'pagado') {
            const unavailableItem = await reserveStock(paymentBeforeUpdate.items);
            if (unavailableItem) {
                return res.status(409).json({
                    msg: `No hay stock suficiente para ${unavailableItem.title}.`
                });
            }
        }
        const payment = await Payment.findOneAndUpdate(
            { orderId: req.params.orderId, user: req.userId },
            { status: req.body.status },
            { new: true, runValidators: true }
        );
        res.json({ payment: paymentResponse(payment) });
    } catch (error) {
        console.error('Error actualizando pago:', error.message);
        res.status(500).json({ msg: 'No se pudo actualizar el pago.' });
    }
}

async function downloadReceipt(req, res) {
    try {
        const payment = await Payment.findOne({ orderId: req.params.orderId, user: req.userId });
        if (!payment) return res.status(404).json({ msg: 'Orden no encontrada.' });

        const user = await User.findById(req.userId).select('nombre apellidos email').lean();
        if (!user) return res.status(401).json({ msg: 'La sesión no pertenece a un usuario válido.' });

        const safeOrderId = payment.orderId.replace(/[^a-zA-Z0-9_-]/g, '');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="recibo-${safeOrderId}.pdf"`);
        res.setHeader('Cache-Control', 'no-store');
        createReceipt(payment, user, res);
    } catch (error) {
        console.error('Error generando recibo:', error.message);
        if (!res.headersSent) res.status(500).json({ msg: 'No se pudo generar el recibo.' });
    }
}

module.exports = { getPayments, createPayment, updatePaymentStatus, downloadReceipt };
