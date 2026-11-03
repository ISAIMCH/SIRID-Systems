const Payment = require('../models/Payment');
const Plan = require('../models/Plan');
const Review = require('../models/Review');
const User = require('../models/User');

function startOfDay(date) {
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    return value;
}

async function getOverview(req, res) {
    try {
        const today = startOfDay(new Date());
        const [users, plans, lowStock, paidOrders, pendingOrders, revenue, recentOrders, salesByDay] = await Promise.all([
            User.countDocuments(),
            Plan.countDocuments({ isActive: { $ne: false } }),
            Plan.countDocuments({ isActive: { $ne: false }, stock: { $lte: 3 } }),
            Payment.countDocuments({ status: 'pagado' }),
            Payment.countDocuments({ status: 'pendiente' }),
            Payment.aggregate([
                { $match: { status: 'pagado' } },
                { $group: { _id: null, total: { $sum: '$total' } } }
            ]),
            Payment.find().populate('user', 'nombre apellidos email').sort({ createdAt: -1 }).limit(8).lean(),
            Payment.aggregate([
                { $match: { status: 'pagado', createdAt: { $gte: new Date(today.getTime() - 6 * 86400000) } } },
                { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, total: { $sum: '$total' }, orders: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ])
        ]);

        res.json({
            metrics: {
                users,
                products: plans,
                lowStock,
                paidOrders,
                pendingOrders,
                revenue: Number(revenue[0]?.total || 0)
            },
            recentOrders: recentOrders.map((order) => ({
                id: order.orderId,
                status: order.status,
                method: order.method,
                total: order.total,
                createdAt: order.createdAt,
                customer: order.user ? `${order.user.nombre} ${order.user.apellidos || ''}`.trim() : 'Usuario no disponible'
            })),
            salesByDay
        });
    } catch (error) {
        console.error('Error cargando resumen administrativo:', error.message);
        res.status(500).json({ msg: 'No se pudo cargar el resumen administrativo.' });
    }
}

async function getOrders(req, res) {
    try {
        const orders = await Payment.find()
            .populate('user', 'nombre apellidos email')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ orders });
    } catch (error) {
        console.error('Error cargando órdenes administrativas:', error.message);
        res.status(500).json({ msg: 'No se pudieron cargar las órdenes.' });
    }
}

async function getInventory(req, res) {
    try {
        const plans = await Plan.find().sort({ stock: 1, nombre: 1 }).lean();
        res.json({ products: plans });
    } catch (error) {
        console.error('Error cargando inventario administrativo:', error.message);
        res.status(500).json({ msg: 'No se pudo cargar el inventario.' });
    }
}

async function updateInventory(req, res) {
    try {
        const stock = Number(req.body.stock);
        if (!Number.isInteger(stock) || stock < 0) {
            return res.status(400).json({ msg: 'El stock debe ser un entero igual o mayor que cero.' });
        }
        const plan = await Plan.findByIdAndUpdate(
            req.params.id,
            { stock },
            { new: true, runValidators: true }
        );
        if (!plan) return res.status(404).json({ msg: 'Producto no encontrado.' });
        res.json({ product: plan });
    } catch (error) {
        console.error('Error actualizando inventario administrativo:', error.message);
        res.status(500).json({ msg: 'No se pudo actualizar el inventario.' });
    }
}

async function getReviews(req, res) {
    try {
        const reviews = await Review.find()
            .populate('user', 'nombre apellidos email')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ reviews });
    } catch (error) {
        console.error('Error cargando reseñas administrativas:', error.message);
        res.status(500).json({ msg: 'No se pudieron cargar las reseñas.' });
    }
}

async function deleteReview(req, res) {
    try {
        const review = await Review.findByIdAndDelete(req.params.id);
        if (!review) return res.status(404).json({ msg: 'Reseña no encontrada.' });
        res.json({ msg: 'Reseña eliminada correctamente.' });
    } catch (error) {
        console.error('Error eliminando reseña administrativa:', error.message);
        res.status(500).json({ msg: 'No se pudo eliminar la reseña.' });
    }
}

module.exports = { getOverview, getOrders, getInventory, updateInventory, getReviews, deleteReview };
