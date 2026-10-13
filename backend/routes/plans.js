const express = require('express');
const {
    getPlans,
    createPlan,
    updatePlan,
    deletePlan
} = require('../controllers/plan.controller');

const router = express.Router();

router.get('/', getPlans);
router.post('/', createPlan);
router.patch('/:id', updatePlan);
router.delete('/:id', deletePlan);

module.exports = router;