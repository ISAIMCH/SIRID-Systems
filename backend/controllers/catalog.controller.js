const Plan = require('../models/Plan');

async function getCatalog(req, res) {
    try {
        const plans = await Plan.find({ isActive: { $ne: false } }).sort({ destacado: -1, precio: 1 }).lean();
        res.json({
            products: plans.map((plan) => ({
                id: String(plan._id),
                name: plan.nombre,
                description: plan.descripcion,
                price: plan.precio,
                billing: plan.tipoCobro,
                stock: plan.stock,
                guarantee: plan.garantia,
                featured: plan.destacado,
                features: plan.caracteristicas
            }))
        });
    } catch (error) {
        console.error('Error cargando catálogo:', error.message);
        res.status(500).json({ msg: 'No se pudo cargar el catálogo.' });
    }
}

module.exports = { getCatalog };
