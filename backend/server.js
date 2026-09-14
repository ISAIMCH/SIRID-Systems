// backend/server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors'); // Necesario para que tu frontend (puerto 5500) pueda hablar con tu backend (puerto 3000)

const app = express();

// ==========================================
// 1. MIDDLEWARES (Configuraciones de seguridad y datos)
// ==========================================
app.use(cors()); // Permite peticiones HTTP entre el cliente y el servidor intermedio seguro
app.use(express.json()); // Permite que el servidor lea los datos en formato JSON enviados por fetch()

// ==========================================
// 2. CONEXIÓN A LA BASE DE DATOS
// ==========================================
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGO_URI)
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
const Plan = require('./models/Plan');

// Conectamos las rutas al motor principal
app.use('/api/auth', authRoutes); 

// Ruta para obtener los planes SaaS desde MongoDB Atlas
app.get('/api/planes', async (req, res) => {
    try {
        const planes = await Plan.find();
        res.json(planes);
    } catch (error) {
        res.status(500).json({ mensaje: 'Error al conectar con MongoDB', error: error.message });
    }
});

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