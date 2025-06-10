const express = require('express');
const cloudController = require('../controllers/cloudController');

const router = express.Router();

// Resource management routes
router.post('/strategy', cloudController.applyResourceStrategy);

module.exports = router; 