const logger = require('../utils/logger');
const importService = require('./importService');
const predictionService = require('./predictionService');
const userService = require('./userService');

/**
 * Data service for managing data import and processing
 */
class DataService {
  /**
   * Import all data files
   * @param {boolean} updateOriginalData - Whether to update original data
   * @returns {Promise<Object>} - Import results
   */
  async importAllFiles(updateOriginalData = true) {
    try {
      logger.info('Importing all data files...');
      const results = await importService.importAllCsvFiles(undefined, updateOriginalData);
      
      return {
        status: 'success',
        message: `Imported ${results.success} files successfully, ${results.failed} files failed, ${results.skipped} files skipped`,
        imported: results.success,
        failed: results.failed,
        skipped: results.skipped,
        files: results.files
      };
    } catch (error) {
      logger.error('Error importing all files:', error);
      return {
        status: 'error',
        message: `Failed to import data: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Import a specific file
   * @param {string} fileName - Name of the file to import
   * @param {boolean} updateOriginalData - Whether to update original data
   * @returns {Promise<Object>} - Import results
   */
  async importSpecificFile(fileName, updateOriginalData = true) {
    try {
      logger.info(`Importing specific file: ${fileName}`);
      const results = await importService.importSpecificFile(fileName, undefined, updateOriginalData);
      
      return {
        status: 'success',
        message: `Imported file ${fileName} successfully`,
        imported: results.success,
        failed: results.failed,
        skipped: results.skipped,
        files: results.files
      };
    } catch (error) {
      logger.error(`Error importing file ${fileName}:`, error);
      return {
        status: 'error',
        message: `Failed to import file ${fileName}: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * Run predictions for all users
   * @returns {Promise<Object>} - Prediction results
   */
  async runPredictionsForAllUsers() {
    try {
      // Get all users
      const users = await userService.getAllUsers();
      
      if (!users || users.length === 0) {
        logger.warn('No users found, cannot run predictions');
        return {
          status: 'error',
          message: 'No users found, cannot run predictions',
          results: []
        };
      }
      
      logger.info(`Running predictions for ${users.length} users`);
      
      // Run predictions for each user
      const results = [];
      for (const user of users) {
        try {
          logger.info(`Running prediction for user ${user.username} (ID: ${user.id})`);
          const predictionResult = await predictionService.runPrediction(user.id);
          
          results.push({
            userId: user.id,
            username: user.username,
            status: predictionResult.status,
            message: predictionResult.message
          });
          
          logger.info(`Prediction for user ${user.username} completed: ${predictionResult.status}`);
        } catch (predErr) {
          logger.error(`Error running prediction for user ${user.username}:`, predErr);
          
          results.push({
            userId: user.id,
            username: user.username,
            status: 'error',
            message: predErr.message
          });
        }
      }
      
      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;
      
      return {
        status: 'success',
        message: `Ran predictions for ${users.length} users: ${successCount} successful, ${errorCount} failed`,
        results
      };
    } catch (error) {
      logger.error('Error running predictions for all users:', error);
      return {
        status: 'error',
        message: `Failed to run predictions: ${error.message}`,
        error: error.message
      };
    }
  }
}

module.exports = new DataService(); 