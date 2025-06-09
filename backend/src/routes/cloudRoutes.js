const express = require('express');
const cloudController = require('../controllers/cloudController');

const router = express.Router();

// AWS account management routes
router.post('/credentials', cloudController.saveCredentials);
router.get('/credentials', cloudController.getCredentials);
router.delete('/credentials', cloudController.deleteAwsAccount);

// Resource management routes
router.post('/resource-strategy', cloudController.applyResourceStrategy);
router.get('/resources', cloudController.getResources);
router.post('/scale', cloudController.scaleResources);

// Cluster management
router.post('/cluster', cloudController.createCluster);
router.get('/clusters', cloudController.getClusters);

module.exports = router; 