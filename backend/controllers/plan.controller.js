const mongoose = require('mongoose');
const Plan = require('../models/Plan');

function normalizeFeatures(value) {
    if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
    return [];
}

function planPayload(body) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
    const duracion = Number(body.duracion);
    const payload = {
        nombre,
        precio: Number(body.precio),
        descripcion: typeof body.descripcion === 'string' && body.descripcion.trim()
            ? body.descripcion.trim()
            : `${nombre} - ${Number.isFinite(duracion) ? duracion : ''} días`.trim(),
        tipoCobro: typeof body.tipoCobro === 'string' && body.tipoCobro.trim() ? body.tipoCobro.trim() : 'Mensual',
        caracteristicas: normalizeFeatures(body.caracteristicas ?? body.especificaciones)
    };

    if (Number.isFinite(duracion) && duracion > 0) payload.durationInDays = duracion;
    if (body.destacado !== undefined) payload.destacado = Boolean(body.destacado);
    if (body.isActive !== undefined) payload.isActive = Boolean(body.isActive);
    return payload;
}

async function getPlans(req, res) {
    try {
        res.json(await Plan.find());
    } catch (error) {
        res.status(500).json({ msg: 'No se pudieron cargar los planes.' });
    }
}

async function createPlan(req, res) {
    try {
        const payload = planPayload(req.body);
        if (!payload.nombre || !Number.isFinite(payload.precio) || payload.precio < 0) {
            return res.status(400).json({ msg: 'Nombre y precio válido son obligatorios.' });
        }
        const plan = await Plan.create(payload);
        res.status(201).json(plan);
    } catch (error) {
        console.error('Error creando plan:', error.message);
        res.status(400).json({ msg: 'No se pudo crear el plan.', error: error.message });
    }
}

async function updatePlan(req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'El identificador no es válido.' });
        const plan = await Plan.findByIdAndUpdate(req.params.id, planPayload(req.body), { new: true, runValidators: true });
        if (!plan) return res.status(404).json({ msg: 'Plan no encontrado.' });
        res.json(plan);
    } catch (error) {
        res.status(400).json({ msg: 'No se pudo actualizar el plan.', error: error.message });
    }
}

async function deletePlan(req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ msg: 'El identificador no es válido.' });
        const plan = await Plan.findByIdAndDelete(req.params.id);
        if (!plan) return res.status(404).json({ msg: 'Plan no encontrado.' });
        res.json({ msg: 'Plan eliminado correctamente.' });
    } catch (error) {
        res.status(500).json({ msg: 'No se pudo eliminar el plan.' });
    }
}

module.exports = { getPlans, createPlan, updatePlan, deletePlan };