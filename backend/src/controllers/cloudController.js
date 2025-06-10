const logger = require('../utils/logger');
const cloudService = require('../services/cloudService');

/**
 * Cloud controller for managing AWS resources
 */
class CloudController {
  /**
   * Apply resource scaling strategy
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async applyResourceStrategy(req, res) {
    try {
      const { strategy, resources, thresholds, region } = req.body;
      
      // Validate required fields
      if (!strategy || !resources || !thresholds || !region) {
        return res.status(400).json({
          status: 'error',
          message: 'Strategy, resources, thresholds, and region are required'
        });
      }
      
      // Apply strategy
      const result = await cloudService.applyResourceStrategy(strategy, resources, thresholds, region);
      
      // Generate appropriate success message based on strategy
      let message = `${strategy} scaling strategy applied successfully`;
      
      if (strategy === 'predictive' && result.details?.predictedMaxCpu) {
        message = `Predictive scaling applied using ML predictions for future load`;
      } else if (strategy === 'auto') {
        message = `Auto scaling configured with CPU threshold of ${thresholds.cpu}%`;
      } else if (strategy === 'manual') {
        message = `Manual scaling set to ${resources.minInstances} instances`;
      }
      
      res.json({
        status: 'success',
        message: message,
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
   * Get current resource strategy for a user
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getCurrentStrategy(req, res) {
    try {
      const userId = parseInt(req.params.userId);
      
      if (!userId || isNaN(userId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid user ID is required'
        });
      }
      
      const currentStrategy = cloudService.getCurrentStrategy(userId);
      
      if (!currentStrategy) {
        return res.status(404).json({
          status: 'info',
          message: 'No active strategy found for this user',
          data: null
        });
      }
      
      res.json({
        status: 'success',
        message: 'Current strategy retrieved successfully',
        data: currentStrategy
      });
    } catch (error) {
      logger.error('Error retrieving current strategy:', error);
      
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve resource strategy'
      });
    }
  }
}

module.exports = new CloudController(); 