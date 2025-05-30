const logger = require('../utils/logger');
const cloudService = require('../services/cloudService');

/**
 * Cloud controller for managing cloud provider resources
 */
class CloudController {
  /**
   * Save cloud provider credentials
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async saveCredentials(req, res) {
    try {
      const { provider, apiKey, apiSecret, region } = req.body;
      
      // Validate required fields
      if (!provider || !apiKey || !apiSecret) {
        return res.status(400).json({
          status: 'error',
          message: 'Provider, API key and secret are required'
        });
      }
      
      // Save credentials
      const result = await cloudService.saveCredentials(provider, apiKey, apiSecret, region);
      
      res.json({
        status: 'success',
        message: 'Cloud credentials saved successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error saving cloud credentials:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to save credentials'
      });
    }
  }
  
  /**
   * Get cloud provider credentials
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCredentials(req, res) {
    try {
      const provider = req.query.provider;
      const credentials = await cloudService.getCredentials(provider);
      
      res.json({
        status: 'success',
        data: credentials
      });
    } catch (error) {
      logger.error('Error retrieving cloud credentials:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve credentials'
      });
    }
  }
  
  /**
   * Apply resource scaling strategy
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async applyResourceStrategy(req, res) {
    try {
      const { provider, strategy, resources, thresholds } = req.body;
      
      // Validate required fields
      if (!provider || !strategy) {
        return res.status(400).json({
          status: 'error',
          message: 'Provider and strategy are required'
        });
      }
      
      // Apply resource strategy
      const result = await cloudService.applyResourceStrategy(provider, strategy, resources, thresholds);
      
      res.json({
        status: 'success',
        message: 'Resource strategy applied successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error applying resource strategy:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to apply resource strategy'
      });
    }
  }
  
  /**
   * Get current cloud resources
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getResources(req, res) {
    try {
      const provider = req.query.provider;
      const resources = await cloudService.getResources(provider);
      
      res.json({
        status: 'success',
        data: resources
      });
    } catch (error) {
      logger.error('Error retrieving resources:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve resources'
      });
    }
  }
  
  /**
   * Scale cloud resources
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async scaleResources(req, res) {
    try {
      const { provider, resourceType, amount } = req.body;
      
      // Validate required fields
      if (!provider || !resourceType || amount === undefined) {
        return res.status(400).json({
          status: 'error',
          message: 'Provider, resource type and amount are required'
        });
      }
      
      // Scale resources
      const result = await cloudService.scaleResources(provider, resourceType, amount);
      
      res.json({
        status: 'success',
        message: `Resources scaled successfully: ${resourceType} to ${amount}`,
        data: result
      });
    } catch (error) {
      logger.error('Error scaling resources:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to scale resources'
      });
    }
  }
  
  /**
   * Create a new cluster
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async createCluster(req, res) {
    try {
      const { provider, name, nodeCount, nodeType, region } = req.body;
      
      // Validate required fields
      if (!provider || !name || !nodeCount || !nodeType) {
        return res.status(400).json({
          status: 'error',
          message: 'Provider, name, node count and node type are required'
        });
      }
      
      // Create cluster
      const result = await cloudService.createCluster(provider, name, nodeCount, nodeType, region);
      
      res.json({
        status: 'success',
        message: 'Cluster created successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error creating cluster:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to create cluster'
      });
    }
  }
  
  /**
   * Get all clusters
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getClusters(req, res) {
    try {
      const provider = req.query.provider;
      const clusters = await cloudService.getClusters(provider);
      
      res.json({
        status: 'success',
        data: clusters
      });
    } catch (error) {
      logger.error('Error retrieving clusters:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve clusters'
      });
    }
  }
}

module.exports = new CloudController(); 