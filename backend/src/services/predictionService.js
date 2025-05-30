const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PythonShell } = require('python-shell');
const logger = require('../utils/logger');
const db = require('../utils/db');
const config = require('../config/config');
const importService = require('./importService');
const userService = require('./userService');

class PredictionService {
  /**
   * Run the XGBoost prediction script
   * @param {string} dataFile - CSV data file to use for prediction
   * @returns {Promise<Object>} - Results of the prediction
   */
  async runPrediction(dataFile) {
    const pythonScriptPath = config.pythonScriptPath;
    const fullDataPath = path.join(config.dataPath, dataFile);
    
    logger.info(`Running prediction script on ${fullDataPath}`);
    
    // Make sure the Python script exists
    if (!fs.existsSync(pythonScriptPath)) {
      const error = `Python script not found at ${pythonScriptPath}`;
      logger.error(error);
      throw new Error(error);
    }
    
    // Make sure the data file exists
    if (!fs.existsSync(fullDataPath)) {
      const error = `Data file not found at ${fullDataPath}`;
      logger.error(error);
      throw new Error(error);
    }
    
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonPath: 'python',  // Or specify absolute path if needed
        pythonOptions: ['-u'], // unbuffered
        scriptPath: path.dirname(pythonScriptPath),
        args: [fullDataPath]
      };
      
      PythonShell.run(path.basename(pythonScriptPath), options).then(results => {
        logger.info('Python script execution completed');
        
        // Parse output to extract results information
        const outputInfo = this.parsePythonOutput(results);
        
        // Import prediction results
        this.importPredictionResults()
          .then(importResults => {
            resolve({
              status: 'success',
              message: 'Prediction completed successfully',
              scriptOutput: outputInfo,
              importResults
            });
          })
          .catch(importErr => {
            logger.error('Error importing prediction results:', importErr);
            reject(importErr);
          });
      }).catch(err => {
        logger.error('Error running Python script:', err);
        reject(err);
      });
    });
  }
  
  /**
   * Parse the Python script output to extract relevant information
   * @param {Array<string>} outputLines - Array of output lines from Python script
   * @returns {Object} - Structured output information
   */
  parsePythonOutput(outputLines) {
    const output = {
      metrics: {},
      filesProcessed: [],
      warnings: [],
      errors: []
    };
    
    // Join all lines and extract relevant information
    const fullOutput = outputLines.join('\n');
    
    // Look for metrics in the output
    const rmseMatch = fullOutput.match(/RMSE:\s+([\d.]+)/);
    if (rmseMatch) output.metrics.rmse = parseFloat(rmseMatch[1]);
    
    const maeMatch = fullOutput.match(/MAE:\s+([\d.]+)/);
    if (maeMatch) output.metrics.mae = parseFloat(maeMatch[1]);
    
    const r2Match = fullOutput.match(/R²:\s+([\d.]+)/);
    if (r2Match) output.metrics.r2 = parseFloat(r2Match[1]);
    
    // Look for saved file information
    const savedFileMatch = fullOutput.match(/Future predictions saved to (.+)/);
    if (savedFileMatch) {
      output.predictionFilePath = savedFileMatch[1];
      output.filesProcessed.push(savedFileMatch[1]);
    }
    
    // Extract warnings and errors
    const warningMatches = fullOutput.match(/Warning:.+/g);
    if (warningMatches) output.warnings = warningMatches;
    
    const errorMatches = fullOutput.match(/Error:.+/g);
    if (errorMatches) output.errors = errorMatches;
    
    return output;
  }
  
  /**
   * Import the prediction results into the database
   * @returns {Promise<Object>} - Import results
   */
  async importPredictionResults() {
    const predictionDir = path.resolve(__dirname, config.predictionResultsPath);

    logger.info(`Importing prediction results from ${predictionDir}`);
    
    try {
      // Look for files matching the pattern *_future_predictions.csv
      const files = fs.readdirSync(predictionDir)
        .filter(file => file.includes('future_predictions.csv'));
            
      const results = {
        imported: 0,
        failed: 0,
        files: [],
        userStats: {}
      };
      
      for (const file of files) {
        const filePath = path.join(predictionDir, file);

        try {
          // Extract target variable from filename
          const targetVar = file.split('-')[0]; // e.g., "average_usage_cpu"
          
          // Parse the CSV file and get users
          const data = await this.parsePredictionCsv(filePath, targetVar);
          logger.info(`Importing ${data.length} prediction results from ${file}`);
          
          // Group data by user
          const userGroups = new Map();
          for (const record of data) {
            // Use record.user if available, otherwise default to 'system'
            const username = record.user || 'system';
            
            if (!userGroups.has(username)) {
              userGroups.set(username, []);
              
              // Initialize user stats if not exists
              if (!results.userStats[username]) {
                results.userStats[username] = { imported: 0, failed: 0 };
              }
            }
            
            userGroups.get(username).push(record);
          }
          
          // Process each user's data
          for (const [username, userRecords] of userGroups.entries()) {
            try {
              // Get or create user
              const user = await userService.getOrCreateUser(username);
              
              // Import data for this user
              await this.savePredictionsToDB(userRecords, user.id);
              
              results.imported += userRecords.length;
              if (results.userStats[username]) {
                results.userStats[username].imported += userRecords.length;
              } else {
                results.userStats[username] = { imported: userRecords.length, failed: 0 };
              }
              
              logger.info(`Successfully imported ${userRecords.length} predictions for user ${username}`);
            } catch (userErr) {
              logger.error(`Failed to import predictions for user ${username}:`, userErr);
              results.failed += userRecords.length;
              if (results.userStats[username]) {
                results.userStats[username].failed += userRecords.length;
              } else {
                results.userStats[username] = { imported: 0, failed: userRecords.length };
              }
            }
          }
          
          results.files.push({
            file,
            status: 'success',
            count: data.length,
            userStats: Object.fromEntries(userGroups.entries().map(([username, records]) => [username, records.length]))
          });
        } catch (err) {
          logger.error(`Failed to import ${file}:`, err);
          results.failed++;
          results.files.push({
            file,
            status: 'failed',
            error: err.message
          });
        }
      }
      
      return results;
    } catch (err) {
      logger.error(`Error reading prediction directory ${predictionDir}:`, err);
      throw err;
    }
  }
  
  /**
   * Parse a prediction CSV file
   * @param {string} filePath - Path to the CSV file
   * @param {string} targetVar - Target variable (e.g., "average_usage_cpu")
   * @returns {Promise<Array>} - Array of prediction objects
   */
  async parsePredictionCsv(filePath, targetVar) {
    return new Promise((resolve, reject) => {
      const results = [];
      console.log(`Parsing prediction CSV file: ${filePath}`);
      
      fs.createReadStream(filePath)
        .on('error', err => reject(err))
        .pipe(csv())
        .on('data', data => {
          const record = {
            time_dt: data.time_dt,
            [targetVar]: parseFloat(data[targetVar]),
            prediction_type: filePath.includes('rf') ? 'rf' : 'xgboost'
          };
          
          // Include user information if available
          if (data.user) {
            record.user = data.user;
          }
          
          results.push(record);
        })
        .on('end', () => resolve(results))
        .on('error', err => reject(err));
    });
  }
  
  /**
   * Save predictions to the database
   * @param {Array} predictions - Array of prediction objects
   * @param {number} userId - User ID for the predictions
   */
  async savePredictionsToDB(predictions, userId) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Identify target column and type
      const targetColumn = Object.keys(predictions[0]).find(key => 
        key !== 'time_dt' && key !== 'prediction_type' && key !== 'user');
        
      const targetType = targetColumn === 'average_usage_cpu' ? 'cpu' : 'memory';
      
      // Get min and max time from the predictions to define the range
      const times = predictions.map(p => new Date(p.time_dt));
      const minTime = new Date(Math.min(...times));
      const maxTime = new Date(Math.max(...times));
      
      logger.info(`Deleting existing ${targetType} predictions for user ${userId} between ${minTime} and ${maxTime}`);
      
      // Delete only predictions within this time range, for this user and target type
      await client.query(
        'DELETE FROM predictions WHERE user_id = $1 AND prediction_type = $2 AND time_dt BETWEEN $3 AND $4 AND ' + 
        (targetType === 'cpu' ? 'average_usage_cpu IS NOT NULL' : 'average_usage_memory IS NOT NULL'),
        [userId, predictions[0].prediction_type, minTime, maxTime]
      );
      
      // Insert new predictions
      for (const prediction of predictions) {
        const timestamp = new Date(prediction.time_dt);
        const value = prediction[targetColumn];
        const predictionType = prediction.prediction_type || 'xgboost';
        
        if (targetType === 'cpu') {
          await client.query(
            `INSERT INTO predictions 
            (time_dt, average_usage_cpu, prediction_type, user_id) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (time_dt, user_id, prediction_type) 
            DO UPDATE SET average_usage_cpu = $2`,
            [timestamp, value, predictionType, userId]
          );
        } else {
          await client.query(
            `INSERT INTO predictions 
            (time_dt, average_usage_memory, prediction_type, user_id) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (time_dt, user_id, prediction_type) 
            DO UPDATE SET average_usage_memory = $2`,
            [timestamp, value, predictionType, userId]
          );
        }
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error saving predictions to database:', err);
      throw err;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get latest predictions for a target variable
   * @param {string} target - Target variable ('cpu' or 'memory')
   * @param {number} limit - Number of predictions to return
   * @param {number} userId - User ID (optional)
   * @returns {Promise<Array>} - Array of prediction objects
   */
  async getLatestPredictions(target = 'cpu', limit = 24, userId = null) {
    const column = target === 'cpu' ? 'average_usage_cpu' : 'average_usage_memory';
    
    try {
      let query;
      let params;
      
      if (userId) {
        // Query with user filter
        query = `
          SELECT time_dt, ${column}, prediction_type
          FROM predictions
          WHERE ${column} IS NOT NULL AND user_id = $1
          ORDER BY time_dt ASC
          LIMIT $2
        `;
        params = [userId, limit];
      } else {
        // Query without user filter (system user or all)
        query = `
          SELECT time_dt, ${column}, prediction_type
          FROM predictions
          WHERE ${column} IS NOT NULL
          ORDER BY time_dt ASC
          LIMIT $1
        `;
        params = [limit];
      }
      
      const { rows } = await db.query(query, params);
      return rows;
    } catch (error) {
      logger.error(`Error fetching latest ${target} predictions:`, error);
      throw error;
    }
  }
  
  /**
   * Get combined historical data and predictions
   * @param {string} target - Target variable ('cpu' or 'memory')
   * @param {number} historyLimit - Number of historical data points
   * @param {number} predictionLimit - Number of prediction points
   * @param {number} userId - User ID (optional)
   * @returns {Promise<Object>} - Object with historical and prediction data
   */
  async getDataAndPredictions(target = 'cpu', historyLimit = 100, predictionLimit = 24, userId = null) {
    try {
      const column = target === 'cpu' ? 'average_usage_cpu' : 'average_usage_memory';
      
      // Get historical data
      let historyQuery;
      let historyParams;
      
      if (userId) {
        historyQuery = `
          SELECT time_dt, ${column}
          FROM historical_data
          WHERE ${column} IS NOT NULL AND user_id = $1
          ORDER BY time_dt DESC
          LIMIT $2
        `;
        historyParams = [userId, historyLimit];
      } else {
        historyQuery = `
          SELECT time_dt, ${column}
          FROM historical_data
          WHERE ${column} IS NOT NULL
          ORDER BY time_dt DESC
          LIMIT $1
        `;
        historyParams = [historyLimit];
      }
      
      const historyResult = await db.query(historyQuery, historyParams);
      
      // Get predictions
      let predictionsQuery;
      let predictionsParams;
      
      if (userId) {
        predictionsQuery = `
          SELECT time_dt, ${column}, prediction_type
          FROM predictions
          WHERE ${column} IS NOT NULL AND user_id = $1
          ORDER BY time_dt ASC
          LIMIT $2
        `;
        predictionsParams = [userId, predictionLimit];
      } else {
        predictionsQuery = `
          SELECT time_dt, ${column}, prediction_type
          FROM predictions
          WHERE ${column} IS NOT NULL
          ORDER BY time_dt ASC
          LIMIT $1
        `;
        predictionsParams = [predictionLimit];
      }
      
      const predictionsResult = await db.query(predictionsQuery, predictionsParams);
      
      return {
        historical: historyResult.rows.reverse(), // Return in chronological order
        predictions: predictionsResult.rows
      };
    } catch (error) {
      logger.error(`Error fetching ${target} data and predictions:`, error);
      throw error;
    }
  }
}

module.exports = new PredictionService(); 