const express = require('express');
const { getCatalog } = require('../controllers/catalog.controller');

const router = express.Router();
router.get('/', getCatalog);

module.exports = router;
