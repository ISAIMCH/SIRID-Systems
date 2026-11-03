const express = require('express');
const { authenticateToken, requireAdmin } = require('./auth');
const {
    getPlans,
    createPlan,
    updatePlan,
    deletePlan
} = require('../controllers/plan.controller');

const router = express.Router();

router.get('/', getPlans);
router.post('/', authenticateToken, requireAdmin, createPlan);
router.patch('/:id', authenticateToken, requireAdmin, updatePlan);
router.delete('/:id', authenticateToken, requireAdmin, deletePlan);

module.exports = router;