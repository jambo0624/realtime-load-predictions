const express = require('express');
const cloudController = require('../controllers/cloudController');

const router = express.Router();

// Resource management routes
router.post('/strategy', cloudController.applyResourceStrategy);
router.get('/strategy/:userId', cloudController.getCurrentStrategy);

module.exports = router; 