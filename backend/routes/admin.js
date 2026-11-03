const express = require('express');
const { authenticateToken, requireAdmin } = require('./auth');
const {
    getOverview,
    getOrders,
    getInventory,
    updateInventory,
    getReviews,
    deleteReview
} = require('../controllers/admin.controller');

const router = express.Router();
router.use(authenticateToken, requireAdmin);
router.get('/overview', getOverview);
router.get('/orders', getOrders);
router.get('/inventory', getInventory);
router.patch('/inventory/:id', updateInventory);
router.get('/reviews', getReviews);
router.delete('/reviews/:id', deleteReview);

module.exports = router;
