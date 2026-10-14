const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dns = require('dns');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((server) => server.trim()));

const email = process.env.LOCAL_DEMO_EMAIL || 'demo@gymgo.local';
const password = process.env.LOCAL_DEMO_PASSWORD || 'GymGoLocal123!';

async function seedLocalUser() {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findOneAndUpdate(
        { email },
        {
            nombre: 'Usuario',
            apellidos: 'Demo Local',
            email,
            password: hashedPassword,
            role: 'Admin',
            verificado: true,
            tokenVerificacion: undefined
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
    console.log(`Usuario local listo: ${email}`);
    console.log(`Contraseña local: ${password}`);
}

seedLocalUser()
    .catch((error) => {
        console.error('No se pudo crear el usuario local:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
