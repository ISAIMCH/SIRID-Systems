const express = require('express');
const { authenticateToken } = require('./auth');
const { createReview, getMyReviews } = require('../controllers/review.controller');

const router = express.Router();
router.use(authenticateToken);
router.get('/', getMyReviews);
router.post('/', createReview);

module.exports = router;
