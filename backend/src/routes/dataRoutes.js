const express = require('express');
const dataController = require('../controllers/dataController');

const router = express.Router();

// Import data routes
router.post('/import', dataController.importData);
router.post('/import-file', dataController.importSpecificFile);

// Data retrieval routes
router.get('/historical', dataController.getHistoricalData);
router.get('/combined', dataController.getDataAndPredictions);
router.get('/all-combined', dataController.getAllDataAndPredictions);
router.get('/predictions', dataController.getLatestPredictions);
router.get('/imported-files', dataController.getImportedFiles);

// User routes
router.get('/users', dataController.getAllUsers);
router.post('/users', dataController.createUser);

// Prediction routes
router.post('/predict', dataController.runPrediction);

// Data management routes
router.post('/reset', dataController.resetData);

module.exports = router; 