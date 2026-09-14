// backend/models/Plan.js
const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    descripcion: { type: String, required: true },
    precio: { type: Number, required: true },
    tipoCobro: { type: String, default: '/mes' },
    destacado: { type: Boolean, default: false },
    caracteristicas: [{ type: String }] // Arreglo para listar los beneficios (ej. Pagos in-app, Upselling)
});

module.exports = mongoose.model('Plan', planSchema);