const logger = require('../utils/logger');
const importService = require('../services/importService');
const predictionService = require('../services/predictionService');
const userService = require('../services/userService');

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
        message: `Imported ${results.success} files successfully, ${results.failed} files failed, ${results.skipped} files skipped`,
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
   * Import a specific CSV file
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async importSpecificFile(req, res) {
    try {
      const { fileName } = req.body;
      
      if (!fileName) {
        return res.status(400).json({
          status: 'error',
          message: 'File name is required'
        });
      }
      
      const results = await importService.importSpecificFile(fileName);
      
      res.status(200).json({
        status: 'success',
        message: `Import completed: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`,
        data: results
      });
    } catch (err) {
      logger.error('Error importing specific file:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to import file',
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
      const { target = 'cpu', limit = 100, username } = req.query;
      const column = target.toLowerCase() === 'cpu' 
        ? 'average_usage_cpu' 
        : 'average_usage_memory';
      
      const db = require('../utils/db');
      
      let query;
      let params;
      let userId = null;
      
      if (username) {
        // Get user by username
        const user = await userService.getUserByUsername(username);
        
        if (!user) {
          return res.status(404).json({
            status: 'error',
            message: `User ${username} not found`
          });
        }
        
        userId = user.id;
      } else {
        // If no username provided, use default system user
        const defaultUser = await userService.getDefaultUser();
        userId = defaultUser.id;
        logger.info(`No username provided, using default system user (ID: ${userId})`);
      }
      
      // Query with user filter
      query = `
        SELECT time_dt, ${column}
        FROM historical_data
        WHERE ${column} IS NOT NULL AND user_id = $1
        ORDER BY time_dt DESC
        LIMIT $2
      `;
      params = [userId, limit];
      
      const { rows } = await db.query(query, params);
      
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
      const { target = 'cpu', historyLimit = 100, predictionLimit = 240, username } = req.query;
      
      let userId = null;
      if (username) {
        const user = await userService.getUserByUsername(username);
        if (user) {
          userId = user.id;
        } else {
          // Return error if username is invalid
          return res.status(404).json({
            status: 'error',
            message: `User ${username} not found`
          });
        }
      } else {
        // If no username provided, use default system user
        const defaultUser = await userService.getDefaultUser();
        userId = defaultUser.id;
        logger.info(`No username provided, using default system user (ID: ${userId})`);
      }
      
      const result = await predictionService.getDataAndPredictions(
        target, 
        parseInt(historyLimit), 
        parseInt(predictionLimit),
        userId
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
      const { historyLimit = 100, predictionLimit = 240, username } = req.query;
      
      let userId = null;
      if (username) {
        // Get user by username
        const user = await userService.getUserByUsername(username);
        if (user) {
          userId = user.id;
        } else {
          // User not found, return error
          return res.status(404).json({
            status: 'error',
            message: `User ${username} not found`
          });
        }
      } else {
        // If no username provided, use default system user
        const defaultUser = await userService.getDefaultUser();
        userId = defaultUser.id;
        logger.info(`No username provided, using default system user (ID: ${userId})`);
      }
      
      // Get CPU data
      const cpuResult = await predictionService.getDataAndPredictions(
        'cpu', 
        parseInt(historyLimit), 
        parseInt(predictionLimit),
        userId
      );
      
      // Get memory data
      const memoryResult = await predictionService.getDataAndPredictions(
        'memory', 
        parseInt(historyLimit), 
        parseInt(predictionLimit),
        userId
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
      const { target = 'cpu', limit = 240, username } = req.query;
      
      let userId = null;
      if (username) {
        const user = await userService.getUserByUsername(username);
        if (user) {
          userId = user.id;
        } else {
          // User not found, return error
          return res.status(404).json({
            status: 'error',
            message: `User ${username} not found`
          });
        }
      } else {
        // Use default system user if no username provided
        const defaultUser = await userService.getDefaultUser();
        userId = defaultUser.id;
        logger.info(`No username provided, using default system user (ID: ${userId})`);
      }
      
      const predictions = await predictionService.getLatestPredictions(
        target, 
        parseInt(limit),
        userId
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
  
  /**
   * Get all imported files for a user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getImportedFiles(req, res) {
    try {
      const { username } = req.query;
      
      let userId = null;
      if (username) {
        const user = await userService.getUserByUsername(username);
        if (user) {
          userId = user.id;
        } else {
          // Return error if username is invalid
          return res.status(404).json({
            status: 'error',
            message: `User ${username} not found`
          });
        }
      } else {
        // If no username provided, use default system user
        const defaultUser = await userService.getDefaultUser();
        userId = defaultUser.id;
        logger.info(`No username provided, using default system user (ID: ${userId})`);
      }
      
      const db = require('../utils/db');
      const query = `
        SELECT if.id, if.file_name, if.record_count, if.imported_at, u.username
        FROM imported_files if
        JOIN users u ON if.user_id = u.id
        WHERE if.user_id = $1
        ORDER BY if.imported_at DESC
      `;
      const params = [userId];
      
      const { rows } = await db.query(query, params);
      
      res.status(200).json({
        status: 'success',
        count: rows.length,
        data: rows
      });
    } catch (err) {
      logger.error('Error fetching imported files:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch imported files',
        error: err.message
      });
    }
  }
  
  /**
   * Get all users
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getAllUsers(req, res) {
    try {
      const db = require('../utils/db');
      
      const query = `
        SELECT id, username, created_at
        FROM users
        ORDER BY username ASC
      `;
      
      const { rows } = await db.query(query);
      
      res.status(200).json({
        status: 'success',
        count: rows.length,
        data: rows
      });
    } catch (err) {
      logger.error('Error fetching users:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to fetch users',
        error: err.message
      });
    }
  }
  
  /**
   * Create a new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async createUser(req, res) {
    try {
      const { username } = req.body;
      
      if (!username) {
        return res.status(400).json({
          status: 'error',
          message: 'Username is required'
        });
      }
      
      // Check if username is valid
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        return res.status(400).json({
          status: 'error',
          message: 'Username must be 3-20 characters and contain only letters, numbers, underscores, and hyphens'
        });
      }
      
      // Check if user already exists
      const existingUser = await userService.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({
          status: 'error',
          message: `User ${username} already exists`
        });
      }
      
      // Create new user
      const newUser = await userService.createUser(username);
      
      res.status(201).json({
        status: 'success',
        message: `User ${username} created successfully`,
        data: newUser
      });
    } catch (err) {
      logger.error('Error creating user:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to create user',
        error: err.message
      });
    }
  }
}

module.exports = new DataController(); 