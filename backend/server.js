// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dns = require('dns');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Necesario para que tu frontend (puerto 5500) pueda hablar con tu backend (puerto 3000)

const app = express();

const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
    .split(',')
    .map((server) => server.trim())
    .filter(Boolean);
dns.setServers(dnsServers);

// ==========================================
// 1. MIDDLEWARES (Configuraciones de seguridad y datos)
// ==========================================
app.use(cors()); // Permite peticiones HTTP entre el cliente y el servidor intermedio seguro
app.use(express.json()); // Permite que el servidor lea los datos en formato JSON enviados por fetch()

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
const { getPlans } = require('./controllers/plan.controller');

// Conectamos las rutas al motor principal
app.use('/api/auth', authRoutes); 
app.use('/api/plans', planRoutes);
app.use('/api/payments', paymentRoutes);

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