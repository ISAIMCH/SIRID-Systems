const express = require('express');
const { authenticateToken } = require('./auth');
const { getPayments, createPayment, updatePaymentStatus, downloadReceipt } = require('../controllers/payment.controller');

const router = express.Router();

router.use(authenticateToken);
router.get('/', getPayments);
router.post('/', createPayment);
router.patch('/:orderId/status', updatePaymentStatus);
router.get('/:orderId/receipt', downloadReceipt);

module.exports = router;
