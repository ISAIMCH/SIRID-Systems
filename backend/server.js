// backend/server.js
// Servidor local de la web pública. La web es solo marketing: cuentas, planes y pagos
// viven en la API de GymGo (repo SIRID-SystemsAppMovil). En Render el frontend lo sirve el Static Site.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');

const app = express();
const frontendRoot = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

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

// Solo en local: en Render el frontend lo sirve el Static Site y este servidor no debe exponer archivos del repo.
if (process.env.RENDER !== 'true' && process.env.NODE_ENV !== 'production') {
    app.use(express.static(frontendRoot));
}

app.get('/api/status', (req, res) => {
    res.json({ estado: 'Web de SIRID Systems operando correctamente' });
});

app.listen(PORT, () => {
    console.log(`Web de SIRID Systems en http://localhost:${PORT}`);
});
