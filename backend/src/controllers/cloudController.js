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
      
      res.json({
        status: 'success',
        message: `${strategy} scaling strategy applied successfully`,
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
}

module.exports = new CloudController(); 