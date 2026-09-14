// backend/seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const Plan = require('./models/Plan');

// Datos de ejemplo basados en el modelo SaaS de Project-GymGo
const planesDePrueba = [
    {
        nombre: "Plan Esencial",
        descripcion: "Ideal para gimnasios locales en crecimiento.",
        precio: 99,
        tipoCobro: "/mes",
        destacado: false,
        caracteristicas: [
            "Pagos in-app para reducir morosidad",
            "Sistema de rachas y gamificación",
            "Módulo de notificaciones push (Upselling)",
            "Reportes de mantenimiento de usuarios"
        ]
    },
    {
        nombre: "Ecosistema Pro",
        descripcion: "Control total con validación física en recepción.",
        precio: 199,
        tipoCobro: "/mes",
        destacado: true,
        caracteristicas: [
            "Todo lo del Plan Esencial",
            "Módulo Coach Creator para entrenadores",
            "Mapas de calor y estadísticas horarias",
            "1 Lector IoT QR + Teclado Físico"
        ]
    },
    {
        nombre: "Hardware IoT Extra",
        descripcion: "Para gimnasios con múltiples accesos o sucursales.",
        precio: 250,
        tipoCobro: " pago único",
        destacado: false,
        caracteristicas: [
            "Lector de validación QR offline",
            "Teclado numérico de respaldo",
            "Conexión a red independiente",
            "Instalación física incluida"
        ]
    }
];

// Conexión e inserción de datos
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Conectado a MongoDB Atlas.');
        
        // Limpiamos la colección antes de insertar para evitar duplicados si corres el script varias veces
        await Plan.deleteMany({});
        console.log('🧹 Colección de planes limpiada.');

        // Insertamos los nuevos planes
        await Plan.insertMany(planesDePrueba);
        console.log('🚀 Planes de prueba insertados exitosamente.');

        // Cerramos la conexión y terminamos el script
        mongoose.connection.close();
        process.exit();
    })
    .catch((error) => {
        console.error('❌ Error:', error);
        process.exit(1);
    });