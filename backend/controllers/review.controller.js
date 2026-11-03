const Payment = require('../models/Payment');
const Review = require('../models/Review');

async function createReview(req, res) {
    try {
        const { orderId, productId, rating, comment } = req.body;
        const numericRating = Number(rating);
        if (typeof orderId !== 'string' || typeof productId !== 'string'
            || !Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5
            || typeof comment !== 'string' || comment.trim().length < 3) {
            return res.status(400).json({ msg: 'La reseña debe incluir calificación y comentario.' });
        }
        const payment = await Payment.findOne({
            orderId: orderId.trim(),
            user: req.userId,
            status: 'pagado',
            'items.productId': productId
        });
        if (!payment) return res.status(403).json({ msg: 'Solo puedes reseñar productos de compras pagadas.' });
        const review = await Review.create({
            user: req.userId,
            productId,
            orderId: payment.orderId,
            rating: numericRating,
            comment: comment.trim()
        });
        res.status(201).json({ review });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ msg: 'Ya registraste una reseña para este producto.' });
        console.error('Error registrando reseña:', error.message);
        res.status(500).json({ msg: 'No se pudo registrar la reseña.' });
    }
}

async function getMyReviews(req, res) {
    try {
        const reviews = await Review.find({ user: req.userId }).sort({ createdAt: -1 }).lean();
        res.json({ reviews });
    } catch (error) {
        console.error('Error cargando reseñas:', error.message);
        res.status(500).json({ msg: 'No se pudieron cargar tus reseñas.' });
    }
}

module.exports = { createReview, getMyReviews };
