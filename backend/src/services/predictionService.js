const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PythonShell } = require('python-shell');
const logger = require('../utils/logger');
const db = require('../utils/db');
const config = require('../config/config');
const importService = require('./importService');

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
        files: []
      };
      
      for (const file of files) {
        const filePath = path.join(predictionDir, file);

        try {
          // Extract target variable from filename
          const targetVar = file.split('-')[0]; // e.g., "average_usage_cpu"
          
          // Parse the CSV file
          const data = await this.parsePredictionCsv(filePath, targetVar);
          logger.info(`-------------------Importing prediction results from ${targetVar}`);
          
          // Import into the database
          await this.savePredictionsToDB(data);
          
          results.imported++;
          results.files.push({
            file,
            status: 'success',
            count: data.length
          });
          
          logger.info(`Successfully imported ${data.length} predictions from ${file}`);
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
      
      fs.createReadStream(filePath)
        .on('error', err => reject(err))
        .pipe(csv())
        .on('data', data => {
          results.push({
            time_dt: data.time_dt,
            [targetVar]: parseFloat(data[targetVar]),
            prediction_type: 'xgboost'
          });
        })
        .on('end', () => resolve(results))
        .on('error', err => reject(err));
    });
  }
  
  /**
   * Save prediction data to the database
   * @param {Array} predictions - Array of prediction objects
   * @returns {Promise<void>}
   */
  async savePredictionsToDB(predictions) {
    return importService.batchInsert(predictions, 'predictions');
  }
  
  /**
   * Get the latest predictions from the database
   * @param {string} target - Target variable (cpu or memory)
   * @param {number} limit - Maximum number of records to return
   * @returns {Promise<Array>} - Array of prediction records
   */
  async getLatestPredictions(target = 'cpu', limit = 24) {
    const column = target.toLowerCase() === 'cpu' 
      ? 'average_usage_cpu' 
      : 'average_usage_memory';
    
    try {
      const { rows } = await db.query(
        `SELECT time_dt, ${column}, prediction_type 
         FROM predictions 
         WHERE ${column} IS NOT NULL 
         ORDER BY time_dt DESC 
         LIMIT $1`,
        [limit]
      );
      
      return rows.reverse(); // Return in chronological order
    } catch (err) {
      logger.error('Error fetching latest predictions:', err);
      throw err;
    }
  }
  
  /**
   * Get both historical data and predictions for a specific target
   * @param {string} target - Target variable (cpu or memory)
   * @param {number} historyLimit - Number of historical records to include
   * @param {number} predictionLimit - Number of prediction records to include
   * @returns {Promise<Object>} - Object with historical and prediction data
   */
  async getDataAndPredictions(target = 'cpu', historyLimit = 100, predictionLimit = 24) {
    const column = target.toLowerCase() === 'cpu' 
      ? 'average_usage_cpu' 
      : 'average_usage_memory';
    
    try {
      // Get historical data
      const historicalResult = await db.query(
        `SELECT time_dt, ${column}
         FROM historical_data
         WHERE ${column} IS NOT NULL
         ORDER BY time_dt DESC
         LIMIT $1`,
        [historyLimit]
      );
      
      // Get predictions
      const predictionsResult = await db.query(
        `SELECT time_dt, ${column}, prediction_type
         FROM predictions
         WHERE ${column} IS NOT NULL
         ORDER BY time_dt ASC
         LIMIT $1`,
        [predictionLimit]
      );
      
      return {
        historical: historicalResult.rows.reverse(), // Chronological order
        predictions: predictionsResult.rows
      };
    } catch (err) {
      logger.error(`Error fetching data and predictions for ${target}:`, err);
      throw err;
    }
  }
}

module.exports = new PredictionService(); 