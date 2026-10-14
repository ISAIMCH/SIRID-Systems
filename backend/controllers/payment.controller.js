const Payment = require('../models/Payment');
const User = require('../models/User');

const METHODS = new Set(['stripe', 'paypal', 'paynet']);
const STATUSES = new Set(['pagado', 'pendiente']);

function paymentResponse(payment) {
    return {
        id: payment.orderId,
        method: payment.method,
        status: payment.status,
        total: payment.total,
        items: payment.items.reduce((sum, item) => sum + item.quantity, 0),
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
        const numericValues = [subtotal, tax, total];
        if (numericValues.some((value) => !Number.isFinite(value) || value < 0)) {
            return res.status(400).json({ msg: 'Los importes del pago no son válidos.' });
        }
        if (!(await User.exists({ _id: req.userId }))) {
            return res.status(401).json({ msg: 'La sesión no pertenece a un usuario válido.' });
        }

        const expectedTotal = Number((subtotal + tax).toFixed(2));
        if (Math.abs(expectedTotal - total) > 0.01) {
            return res.status(400).json({ msg: 'El total de la orden no coincide con el subtotal y el IVA.' });
        }
        const payment = await Payment.create({
            orderId: id.trim(),
            user: req.userId,
            method,
            status,
            subtotal,
            tax,
            total,
            items,
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
        const payment = await Payment.findOneAndUpdate(
            { orderId: req.params.orderId, user: req.userId },
            { status: req.body.status },
            { new: true, runValidators: true }
        );
        if (!payment) return res.status(404).json({ msg: 'Orden no encontrada.' });
        res.json({ payment: paymentResponse(payment) });
    } catch (error) {
        console.error('Error actualizando pago:', error.message);
        res.status(500).json({ msg: 'No se pudo actualizar el pago.' });
    }
}

module.exports = { getPayments, createPayment, updatePaymentStatus };
