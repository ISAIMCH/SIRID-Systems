const mongoose = require('mongoose');

const paymentItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    title: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const paymentSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    method: { type: String, enum: ['stripe', 'paypal', 'paynet'], required: true },
    status: { type: String, enum: ['pagado', 'pendiente'], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    items: { type: [paymentItemSchema], required: true },
    last4: { type: String, maxlength: 4 },
    reference: { type: String, maxlength: 32 },
    expiresAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
