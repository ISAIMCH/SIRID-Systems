require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');

const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sirid-api' }));
app.use('/api/auth', authRoutes);
app.listen(port, () => console.log(`SIRID API disponible en http://localhost:${port}`));
