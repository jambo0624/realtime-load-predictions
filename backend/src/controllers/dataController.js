const logger = require('../utils/logger');
const importService = require('../services/importService');
const predictionService = require('../services/predictionService');

class DataController {
  /**
   * Import all CSV files from the data directory
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async importData(req, res) {
    try {
      const results = await importService.importAllCsvFiles();
      res.status(200).json({
        status: 'success',
        message: `Imported ${results.success} files successfully, ${results.failed} files failed`,
        data: results
      });
    } catch (err) {
      logger.error('Error importing data:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to import data',
        error: err.message
      });
    }
  }
  
  /**
   * Get historical data for a specific target
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getHistoricalData(req, res) {
    try {
      const { target = 'cpu', limit = 100 } = req.query;
      const column = target.toLowerCase() === 'cpu' 
        ? 'average_usage_cpu' 
        : 'average_usage_memory';
      
      const db = require('../utils/db');
      const { rows } = await db.query(
        `SELECT time_dt, ${column}
         FROM historical_data
         WHERE ${column} IS NOT NULL
         ORDER BY time_dt DESC
         LIMIT $1`,
        [limit]
      );
      
      res.status(200).json({
        status: 'success',
        count: rows.length,
        data: rows.reverse() // Return in chronological order
      });
    } catch (err) {
      logger.error('Error fetching historical data:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch historical data',
        error: err.message
      });
    }
  }
  
  /**
   * Get both historical data and predictions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getDataAndPredictions(req, res) {
    try {
      const { target = 'cpu', historyLimit = 100, predictionLimit = 24 } = req.query;
      
      const result = await predictionService.getDataAndPredictions(
        target, 
        parseInt(historyLimit), 
        parseInt(predictionLimit)
      );
      
      res.status(200).json({
        status: 'success',
        data: result
      });
    } catch (err) {
      logger.error('Error fetching data and predictions:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch data and predictions',
        error: err.message
      });
    }
  }
  
  /**
   * Get both CPU and memory data together
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getAllDataAndPredictions(req, res) {
    try {
      const { historyLimit = 100, predictionLimit = 24 } = req.query;
      
      // Get CPU data
      const cpuResult = await predictionService.getDataAndPredictions(
        'cpu', 
        parseInt(historyLimit), 
        parseInt(predictionLimit)
      );
      
      // Get memory data
      const memoryResult = await predictionService.getDataAndPredictions(
        'memory', 
        parseInt(historyLimit), 
        parseInt(predictionLimit)
      );
      
      res.status(200).json({
        status: 'success',
        data: {
          cpu: cpuResult,
          memory: memoryResult
        }
      });
    } catch (err) {
      logger.error('Error fetching all data and predictions:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch all data and predictions',
        error: err.message
      });
    }
  }
  
  /**
   * Run prediction for a specific data file
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async runPrediction(req, res) {
    try {
      const { dataFile } = req.body;
      
      if (!dataFile) {
        return res.status(400).json({
          status: 'error',
          message: 'Data file is required'
        });
      }
      
      const result = await predictionService.runPrediction(dataFile);
      
      res.status(200).json({
        status: 'success',
        message: 'Prediction completed successfully',
        data: result
      });
    } catch (err) {
      logger.error('Error running prediction:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to run prediction',
        error: err.message
      });
    }
  }
  
  /**
   * Get latest predictions
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getLatestPredictions(req, res) {
    try {
      const { target = 'cpu', limit = 24 } = req.query;
      
      const predictions = await predictionService.getLatestPredictions(
        target, 
        parseInt(limit)
      );
      
      res.status(200).json({
        status: 'success',
        count: predictions.length,
        data: predictions
      });
    } catch (err) {
      logger.error('Error fetching latest predictions:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch latest predictions',
        error: err.message
      });
    }
  }
}

module.exports = new DataController(); 