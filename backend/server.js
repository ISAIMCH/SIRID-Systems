// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dns = require('dns');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Necesario para que tu frontend (puerto 5500) pueda hablar con tu backend (puerto 3000)

const app = express();
const frontendRoot = path.join(__dirname, '..');

const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
dns.setServers(dnsServers);

// ==========================================
// 1. MIDDLEWARES (Configuraciones de seguridad y datos)
// ==========================================
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5500,http://127.0.0.1:5500')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origen no autorizado por la API.'));
    }
})); // Solo permite los frontends configurados
app.use(express.json()); // Permite que el servidor lea los datos en formato JSON enviados por fetch()
app.use(express.static(frontendRoot));

// ==========================================
// 2. CONEXIÓN A LA BASE DE DATOS
// ==========================================
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 })
    .then(() => {
        console.log('✅ Conexión exitosa a la bóveda en la nube de MongoDB Atlas');
    })
    .catch((error) => {
        console.error('❌ Error conectando a MongoDB Atlas:', error.message);
    });

// ==========================================
// 3. IMPORTACIÓN DE RUTAS (El código que faltaba)
// ==========================================
// Importamos el archivo auth.js que manejará el login, registro y encriptación
const authRoutes = require('./routes/auth'); 
const planRoutes = require('./routes/plans');
const paymentRoutes = require('./routes/payments');
const catalogRoutes = require('./routes/catalog');
const reviewRoutes = require('./routes/reviews');
const adminRoutes = require('./routes/admin');
const { getPlans } = require('./controllers/plan.controller');

// Conectamos las rutas al motor principal
app.use('/api/auth', authRoutes); 
app.use('/api/plans', planRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/admin', adminRoutes);

// Ruta para obtener los planes SaaS desde MongoDB Atlas
app.get('/api/planes', getPlans);

// Ruta de diagnóstico
app.get('/api/status', (req, res) => {
    res.json({ estado: 'Servidor SaaS operando correctamente' });
});

// ==========================================
// 4. INICIALIZACIÓN DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor intermedio seguro corriendo en http://localhost:${PORT}`);
});