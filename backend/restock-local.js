const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const dns = require('dns');
const mongoose = require('mongoose');
const Plan = require('./models/Plan');

dns.setServers((process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1').split(',').map((server) => server.trim()));

const requestedStock = Number(process.argv[2] || 10);

async function restockLocal() {
    if (!Number.isInteger(requestedStock) || requestedStock < 0) {
        throw new Error('Indica una cantidad entera de stock igual o mayor que cero.');
    }

    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const result = await Plan.updateMany(
        { isActive: { $ne: false } },
        { $set: { stock: requestedStock } }
    );

    console.log(`Stock actualizado a ${requestedStock} unidades en ${result.modifiedCount} planes activos.`);
}

restockLocal()
    .catch((error) => {
        console.error('No se pudo reponer el inventario:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
