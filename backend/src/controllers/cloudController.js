const logger = require('../utils/logger');
const cloudService = require('../services/cloudService');

/**
 * Cloud controller for managing AWS resources
 */
class CloudController {
  /**
   * Save AWS account with IAM role
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async saveCredentials(req, res) {
    try {
      const { userId, accountId, roleArn, externalId, regions } = req.body;
      
      // Validate required fields
      if (!userId || !accountId || !roleArn || !regions) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID, AWS account ID, IAM role ARN and regions are required'
        });
      }
      
      // Save AWS account with IAM role
      const result = await cloudService.saveAwsAccount(userId, accountId, roleArn, externalId, regions);
      
      res.json({
        status: 'success',
        message: result.updated 
          ? 'AWS account updated successfully' 
          : 'AWS account created successfully',
        data: result.account
      });
    } catch (error) {
      logger.error('Error saving AWS account:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to save AWS account'
      });
    }
  }
  
  /**
   * Get AWS accounts for a user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCredentials(req, res) {
    try {
      const userId = parseInt(req.query.userId);
      
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID is required'
        });
      }
      
      const result = await cloudService.getAwsAccounts(userId);
      
      res.json({
        status: 'success',
        data: result.accounts
      });
    } catch (error) {
      logger.error('Error retrieving AWS accounts:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve AWS accounts'
      });
    }
  }
  
  /**
   * Delete an AWS account
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async deleteAwsAccount(req, res) {
    try {
      const { accountId, userId } = req.body;
      
      if (!accountId || !userId) {
        return res.status(400).json({
          status: 'error',
          message: 'Account ID and user ID are required'
        });
      }
      
      const result = await cloudService.deleteAwsAccount(accountId, userId);
      
      res.json({
        status: 'success',
        message: 'AWS account deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting AWS account:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to delete AWS account'
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
      const { strategy, resources, thresholds, accountId, region } = req.body;
      
      // Validate required fields
      if (!strategy || !accountId || !region) {
        return res.status(400).json({
          status: 'error',
          message: 'Strategy, AWS account ID and region are required'
        });
      }
      
      // Apply resource strategy
      const result = await cloudService.applyResourceStrategy(strategy, resources, thresholds, accountId, region);
      
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
      const accountId = parseInt(req.query.accountId);
      const region = req.query.region;
      
      if (!accountId || !region) {
        return res.status(400).json({
          status: 'error',
          message: 'AWS account ID and region are required'
        });
      }
      
      const resources = await cloudService.getResources(accountId, region);
      
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
      const { resourceType, amount, accountId, region } = req.body;
      
      // Validate required fields
      if (!resourceType || amount === undefined || !accountId || !region) {
        return res.status(400).json({
          status: 'error',
          message: 'Resource type, amount, AWS account ID and region are required'
        });
      }
      
      // Scale resources
      const result = await cloudService.scaleResources(resourceType, amount, accountId, region);
      
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
      const { name, nodeCount, nodeType, accountId, region } = req.body;
      
      // Validate required fields
      if (!name || !nodeCount || !nodeType || !accountId || !region) {
        return res.status(400).json({
          status: 'error',
          message: 'Name, node count, node type, AWS account ID and region are required'
        });
      }
      
      // Create cluster
      const result = await cloudService.createCluster(name, nodeCount, nodeType, accountId, region);
      
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
      const accountId = parseInt(req.query.accountId);
      const region = req.query.region;
      
      if (!accountId || !region) {
        return res.status(400).json({
          status: 'error',
          message: 'AWS account ID and region are required'
        });
      }
      
      const clusters = await cloudService.getClusters(accountId, region);
      
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