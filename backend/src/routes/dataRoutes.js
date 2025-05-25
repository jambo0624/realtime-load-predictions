const express = require('express');
const dataController = require('../controllers/dataController');

const router = express.Router();

// Import data routes
router.post('/import', dataController.importData);

// Data retrieval routes
router.get('/historical', dataController.getHistoricalData);
router.get('/combined', dataController.getDataAndPredictions);
router.get('/predictions', dataController.getLatestPredictions);

// Prediction routes
router.post('/predict', dataController.runPrediction);

module.exports = router; 