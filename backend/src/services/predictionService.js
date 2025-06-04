const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { PythonShell } = require('python-shell');
const dayjs = require('dayjs');
const logger = require('../utils/logger');
const db = require('../utils/db');
const config = require('../config/config');
const userService = require('./userService');

class PredictionService {
    /**
   * Run a multi-step rolling prediction using database data
   * Each step uses predictions from previous steps as input
   * @param {number} userId - User ID to run prediction for
   * @returns {Promise<Object>} - Results of the prediction
   */
  async runPrediction(userId) {
    if (!userId) {
      throw new Error('User ID is required for rolling prediction');
    }
    
    logger.info(`Starting rolling prediction for user ${userId}`);
    
    try {
      // Number of data points per prediction
      const pointsPerStep = 240;
      // Always use 2 steps to generate 480 total predictions (24 hours of data with 3-minute intervals)
      const totalSteps = 2;
      
      let results = {
        steps: [],
        totalPredictions: 0,
        completedSteps: 0
      };
      
      // For each step
      for (let step = 1; step <= totalSteps; step++) {
        logger.info(`Running prediction step ${step}/${totalSteps} for user ${userId}`);
        
        // Create a temporary CSV file from the current historical data
        let tempFilePath;
        
        try {
          // Create temporary file
          tempFilePath = await this.createTempDataFile(userId, step);
          logger.info(`Generated temp file for step ${step}: ${tempFilePath}`);
          
          // Run the prediction using the file
          const stepResult = await this.runPredictionWithFile(tempFilePath, userId, step);
          
          // Update historical data with the new predictions
          const updateResult = await db.updateHistoricalWithPredictions(userId, 'xgboost', pointsPerStep);
          
          logger.info(`Step ${step} complete: ${updateResult.count} prediction records used for next step`);
          
          // Delete the temporary file if it exists
          if (fs.existsSync(tempFilePath)) {
            logger.info(`Deleting temp file: ${tempFilePath}`);
            fs.unlinkSync(tempFilePath);
          } else {
            logger.warn(`Temp file not found for deletion: ${tempFilePath}`);
          }
          
          // Add step results
          results.steps.push({
            step,
            predictionsGenerated: updateResult.count,
            timeRange: stepResult.timeRange
          });
          
          results.totalPredictions += updateResult.count;
          results.completedSteps++;
        } catch (stepError) {
          logger.error(`Error in step ${step} of rolling prediction:`, stepError);
          
          // Try to clean up the temp file if it exists
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
              logger.info(`Cleaning up temp file after error: ${tempFilePath}`);
              fs.unlinkSync(tempFilePath);
            } catch (cleanupError) {
              logger.warn(`Failed to delete temp file: ${cleanupError.message}`);
            }
          }
          
          throw stepError;
        }
      }
      
      // Check if the final predictions are saved
      // Count the number of predictions in the predictions table
      const { rows } = await db.query(
        'SELECT COUNT(*) FROM predictions WHERE user_id = $1',
        [userId]
      );
      
      const finalPredictionCount = parseInt(rows[0]?.count || '0');
      
      // Log detailed information about prediction counts
      const expectedCount = 480; // Always expect 480 predictions (24 hours with 3-minute intervals)
      logger.info(`Rolling prediction complete for user ${userId}: ${results.totalPredictions} predictions moved to historical data`);
      logger.info(`Predictions remaining in predictions table: ${finalPredictionCount} (expected ${expectedCount})`);
      
      results.finalPredictionCount = finalPredictionCount;
      results.expectedCount = expectedCount;
      
      return results;
    } catch (error) {
      logger.error(`Error in rolling prediction for user ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Create a temporary CSV file from the current historical data
   * @param {number} userId - User ID to get data for
   * @param {number} step - Current prediction step
   * @returns {Promise<string>} - Path to the created file
   */
  async createTempDataFile(userId, step) {
    const user = await userService.getUserById(userId);
    const username = user.username;

    try {
      // Get historical data for both CPU and memory
      const query = `
        SELECT time_dt, average_usage_cpu, average_usage_memory
        FROM historical_data
        WHERE user_id = $1
        ORDER BY time_dt ASC
      `;
      
      const { rows } = await db.query(query, [userId]);
      
      if (rows.length === 0) {
        throw new Error(`No historical data found for user ${userId}`);
      }
      
      // Use a reliable absolute path for temp files
      const tempDir = path.resolve(__dirname, '../../../ml_engine/processed_data/temp');
      logger.info(`Using absolute path for temp directory: ${tempDir}`);
      
      if (!fs.existsSync(tempDir)) {
        logger.info(`Creating temp directory: ${tempDir}`);
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Create a temp file
      const timestamp = dayjs().valueOf();
      const tempFilePath = path.join(tempDir, `temp_data_${userId}_${timestamp}_${step}.csv`);
      
      // Write CSV header and data
      const header = 'time_dt,average_usage_cpu,average_usage_memory,user\n';
      const csvData = rows.map(row => {
        // Format time_dt to PostgreSQL compatible format: YYYY-MM-DD HH:MM:SS
        const dateObj = new Date(row.time_dt);
        const formattedDate = dayjs(dateObj).format('YYYY-MM-DD HH:mm:ss');
        
        return `${formattedDate},${row.average_usage_cpu || ''},${row.average_usage_memory || ''},${username}`;
      }).join('\n');
      
      fs.writeFileSync(tempFilePath, header + csvData);
      
      // Log the first and last timestamp for verification
      if (rows.length > 0) {
        const firstRow = rows[0];
        const lastRow = rows[rows.length - 1];
        
        const firstDate = new Date(firstRow.time_dt);
        const lastDate = new Date(lastRow.time_dt);
        
        const firstFormatted = dayjs(firstDate).format('YYYY-MM-DD HH:mm:ss');
        const lastFormatted = dayjs(lastDate).format('YYYY-MM-DD HH:mm:ss');
        
        logger.info(`CSV time format - First timestamp: ${firstFormatted}, Last timestamp: ${lastFormatted}`);
      }
      
      logger.info(`Created temporary data file with ${rows.length} records: ${tempFilePath}`);
      logger.info(`File exists check: ${fs.existsSync(tempFilePath)}`);
      return tempFilePath;
    } catch (error) {
      logger.error(`Error creating temporary data file for user ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Run the XGBoost prediction script with a specific file
   * @param {string} dataFile - CSV data file to use for prediction
   * @param {number} userId - User ID to run prediction for (optional)
   * @param {number} step - Current prediction step (optional)
   * @returns {Promise<Object>} - Results of the prediction
   */
  async runPredictionWithFile(dataFile, userId = null, step = 1) {
    const pythonScriptPath = config.pythonScriptPath;
    
    // Improved path handling for data files
    let fullDataPath;
    
    if (path.isAbsolute(dataFile)) {
      // If it's already an absolute path, use it directly
      fullDataPath = dataFile;
      logger.info(`Using absolute data file path: ${fullDataPath}`);
    } else if (dataFile.includes('temp_data_')) {
      // If it's a temp file, check if it already has the correct path
      if (fs.existsSync(dataFile)) {
        // File exists with current path
        fullDataPath = dataFile;
        logger.info(`Using temp file with relative path: ${fullDataPath}`);
      } else if (fs.existsSync(path.join(config.dataPath, dataFile))) {
        // File exists in dataPath
        fullDataPath = path.join(config.dataPath, dataFile);
        logger.info(`Using temp file in dataPath: ${fullDataPath}`);
      } else if (fs.existsSync(path.join(config.dataPath, 'temp', dataFile))) {
        // File exists in dataPath/temp
        fullDataPath = path.join(config.dataPath, 'temp', dataFile);
        logger.info(`Using temp file in dataPath/temp: ${fullDataPath}`);
      } else {
        // Try to find the file using a more reliable path construction
        const tempDir = path.resolve(__dirname, '../../../ml_engine/processed_data/temp');
        fullDataPath = path.join(tempDir, dataFile);
        logger.info(`Attempting to use resolved temp path: ${fullDataPath}`);
      }
    } else {
      // Regular file in dataPath
      fullDataPath = path.join(config.dataPath, dataFile);
      logger.info(`Using standard data file path: ${fullDataPath}`);
    }
    
    logger.info(`Running prediction script on ${fullDataPath}${userId ? ` for user ${userId}` : ''}`);
    
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
    
    // Define output directory and file prefix
    const outputDir = path.resolve(__dirname, '../../../ml_engine/prediction_results');
    const timestamp = dayjs().format('YYYYMMDD_HHmmss');
    const outputFilePrefix = `step${step}_user${userId}_${timestamp}`;
    const modelDir = path.resolve(__dirname, '../../../ml_engine/models');
    
    logger.info(`Using output directory: ${outputDir}`);
    logger.info(`Using output file prefix: ${outputFilePrefix}`);
    logger.info(`Using model directory: ${modelDir}`);
    
    return new Promise((resolve, reject) => {
      const options = {
        mode: 'text',
        pythonPath: 'python',  // Or specify absolute path if needed
        pythonOptions: ['-u'], // unbuffered
        scriptPath: path.dirname(pythonScriptPath),
        args: [fullDataPath, outputDir, outputFilePrefix, modelDir]
      };
      
      PythonShell.run(path.basename(pythonScriptPath), options).then(results => {
        logger.info('Python script execution completed');
        
        // Check if output files were created
        const expectedCpuFile = path.join(outputDir, `${outputFilePrefix}_average_usage_cpu.csv`);
        const expectedMemoryFile = path.join(outputDir, `${outputFilePrefix}_average_usage_memory.csv`);
        
        logger.info(`Checking for output files:`);
        logger.info(`- CPU file: ${expectedCpuFile} (exists: ${fs.existsSync(expectedCpuFile)})`);
        logger.info(`- Memory file: ${expectedMemoryFile} (exists: ${fs.existsSync(expectedMemoryFile)})`);
        
        // Try to list all files in the directory
        try {
          const dirFiles = fs.readdirSync(outputDir);
          logger.info(`Files in output directory (${dirFiles.length} total):`);
          dirFiles.filter(f => f.includes(outputFilePrefix)).forEach(f => {
            logger.info(`- ${f}`);
          });
        } catch (err) {
          logger.warn(`Could not read output directory: ${err.message}`);
        }
        
        // Parse output to extract results information
        const outputInfo = this.parsePythonOutput(results);
        
        // Import generated prediction results
        this.importPredictionResults(step, outputFilePrefix)
          .then(importResults => {
            // Add import results to output info
            outputInfo.importResults = importResults;
            
            // Extract time range from the data
            this._extractTimeRange(fullDataPath)
              .then(timeRange => {
                // Add time range to the result
                outputInfo.timeRange = timeRange;
                
                resolve({
                  status: 'success',
                  message: 'Prediction completed successfully',
                  scriptOutput: outputInfo,
                  timeRange,
                  userId,
                  step,
                  importResults
                });
              })
              .catch(err => {
                logger.warn('Could not extract time range from data file:', err);
                resolve({
                  status: 'success',
                  message: 'Prediction completed successfully (no time range info)',
                  scriptOutput: outputInfo,
                  userId,
                  step,
                  importResults
                });
              });
          })
          .catch(importErr => {
            logger.error('Error importing prediction results:', importErr);
            // Even if import failed, return success status but include error info
            resolve({
              status: 'partial_success',
              message: 'Prediction completed but import failed',
              scriptOutput: outputInfo,
              importError: importErr.message,
              userId,
              step
            });
          });
      }).catch(err => {
        logger.error('Error running Python script:', err);
        logger.error(`Script path: ${pythonScriptPath}`);
        logger.error(`Script directory exists: ${fs.existsSync(path.dirname(pythonScriptPath))}`);
        logger.error(`Output directory exists: ${fs.existsSync(outputDir)}`);
        logger.error(`Data file exists: ${fs.existsSync(fullDataPath)}`);
        logger.error(`Data file size: ${fs.existsSync(fullDataPath) ? fs.statSync(fullDataPath).size : 'N/A'} bytes`);
        
        // Try to read Python error traceback if available
        if (err.traceback) {
          logger.error(`Python traceback: ${err.traceback}`);
        }
        reject(err);
      });
    });
  }
  
  /**
   * Extract time range from data file for reporting
   * @param {string} filePath - Path to the data file
   * @returns {Promise<Object>} - Min and max time in the file
   */
  async _extractTimeRange(filePath) {
    return new Promise((resolve, reject) => {
      const times = [];
      
      fs.createReadStream(filePath)
        .on('error', err => reject(err))
        .pipe(csv())
        .on('data', data => {
          if (data.time_dt) {
            try {
              // Parse date using dayjs for better handling
              const parsedDate = dayjs(data.time_dt);
              if (parsedDate.isValid()) {
                times.push(parsedDate.toDate());
              }
            } catch (e) {
              // Ignore invalid dates
            }
          }
        })
        .on('end', () => {
          if (times.length === 0) {
            reject(new Error('No valid timestamps found in file'));
          } else {
            const minTime = dayjs(Math.min(...times.map(t => t.getTime()))).toDate();
            const maxTime = dayjs(Math.max(...times.map(t => t.getTime()))).toDate();
            
            logger.info(`File time range: ${dayjs(minTime).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(maxTime).format('YYYY-MM-DD HH:mm:ss')}`);
            
            resolve({
              minTime,
              maxTime
            });
          }
        })
        .on('error', err => reject(err));
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
   * @param {number} step - Current prediction step
   * @param {string} outputFilePrefix - The prefix used for output files (optional)
   * @returns {Promise<Object>} - Import results
   */
  async importPredictionResults(step, outputFilePrefix) {
    const predictionDir = path.resolve(__dirname, config.predictionResultsPath);

    logger.info(`Importing prediction results from ${predictionDir}${step ? ` for step ${step}` : ''}`);
    logger.info(outputFilePrefix ? `Looking for files with prefix: ${outputFilePrefix}` : 'Processing all matching files');
    
    try {
      // Look for files that match our criteria
      let files = fs.readdirSync(predictionDir);
      
      // If outputFilePrefix is provided, use it to filter files
      if (outputFilePrefix) {
        files = files.filter(file => file.startsWith(outputFilePrefix));
        logger.info(`Found ${files.length} files matching prefix ${outputFilePrefix}`);
      } else {
        // Otherwise use the traditional pattern
        files = files.filter(file => 
          file.includes('future_predictions.csv') || 
          (file.includes('step') && file.includes('user') && file.endsWith('.csv'))
        );
        
        // If step is provided, filter files for that specific step
        if (step) {
          const stepFiles = files.filter(file => file.includes(`step${step}_`));
          if (stepFiles.length > 0) {
            logger.info(`Filtered ${stepFiles.length} files for step ${step} (from total ${files.length} files)`);
            files = stepFiles;
          } else {
            logger.warn(`No files found specifically for step ${step}, processing all ${files.length} files`);
          }
        }
      }
            
      logger.info(`Found ${files.length} prediction files to import`);
      
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
          let targetVar;
          let fileStep = null;
          
          // Try to extract step number from filename if it contains 'step'
          if (file.includes('step')) {
            const stepMatch = file.match(/step(\d+)/);
            if (stepMatch && stepMatch[1]) {
              fileStep = parseInt(stepMatch[1], 10);
              logger.info(`Extracted step ${fileStep} from filename ${file}`);
            }
          }
          
          // Use the provided step or the one extracted from filename
          const currentStep = step || fileStep;
          
          // Determine target variable from file
          if (file.includes('average_usage_cpu') || file.includes('cpu')) {
            targetVar = 'average_usage_cpu';
          } else if (file.includes('average_usage_memory') || file.includes('memory')) {
            targetVar = 'average_usage_memory';
          } else {
            // Examine file content to determine target variable
            logger.info(`Determining target variable from file content for ${file}`);
            const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
            if (firstLine.includes('average_usage_cpu')) {
              targetVar = 'average_usage_cpu';
            } else if (firstLine.includes('average_usage_memory')) {
              targetVar = 'average_usage_memory';
            } else {
              throw new Error(`Could not determine target variable for file ${file}`);
            }
            logger.info(`Determined target variable: ${targetVar}`);
          }
          
          // Parse the CSV file and get users
          const data = await this.parsePredictionCsv(filePath, targetVar, currentStep);
          logger.info(`Importing ${data.length} ${targetVar} prediction results from ${filePath} in step ${currentStep}`);
          
          if (data.length > 0) {
            logger.info(`Time range: ${dayjs(data[0].time_dt).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(data[data.length - 1].time_dt).format('YYYY-MM-DD HH:mm:ss')}`);
          }
          
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
              await this.savePredictionsToDB(userRecords, user.id, currentStep);
              
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
            targetVar,
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
   * @param {number} step - Current prediction step (optional)
   * @returns {Promise<Array>} - Array of prediction objects
   */
  async parsePredictionCsv(filePath, targetVar, step = 1) {
    return new Promise((resolve, reject) => {
      const results = [];
      console.log(`Parsing prediction CSV file: ${filePath}`);
      
      // Determine prediction type from filename
      let predictionType = 'xgboost'; // Default to xgboost
      const fileName = path.basename(filePath);
      
      if (fileName.includes('rf')) {
        predictionType = 'rf';
      } else if (fileName.includes('xgb')) {
        predictionType = 'xgboost';
      }
      
      logger.info(`Using prediction type: ${predictionType} for file: ${fileName}`);
      
      // Extract step from filename if possible and not provided
      if (!step && fileName.includes('step')) {
        const stepMatch = fileName.match(/step(\d+)/);
        if (stepMatch && stepMatch[1]) {
          step = parseInt(stepMatch[1], 10);
          logger.info(`Extracted step ${step} from filename ${fileName}`);
        }
      }
      
      // Default to step 1 if still not available
      step = step || 1;
      
      // Base index for this step (each step has up to 1000 predictions)
      const baseIndex = (step - 1) * 1000;
      
      fs.createReadStream(filePath)
        .on('error', err => reject(err))
        .pipe(csv())
        .on('data', (data, index) => {
          // Parse time_dt using dayjs for better handling
          const parsedDate = dayjs(data.time_dt);
          if (!parsedDate.isValid()) {
            logger.warn(`Invalid date in CSV: ${data.time_dt}, skipping record`);
            return;
          }
          
          const record = {
            time_dt: parsedDate.format('YYYY-MM-DD HH:mm:ss'),
            [targetVar]: parseFloat(data[targetVar]),
            prediction_type: predictionType
          };
          
          // Include user information if available
          if (data.user) {
            record.user = data.user;
          }
          
          // Add to results array
          results.push(record);
        })
        .on('end', () => {
          // Add sequence index to each record with step offset
          results.forEach((record, index) => {
            record.sequence_idx = baseIndex + index;
          });
          
          logger.info(`Parsed ${results.length} records with sequence_idx range: ${baseIndex} to ${baseIndex + results.length - 1}`);
          resolve(results);
        })
        .on('error', err => reject(err));
    });
  }
  
  /**
   * Save predictions to the database
   * @param {Array} predictions - Array of prediction objects
   * @param {number} userId - User ID for the predictions
   * @param {number} step - Current prediction step (optional)
   */
  async savePredictionsToDB(predictions, userId, step) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Identify target column and type
      const targetColumn = Object.keys(predictions[0]).find(key => 
        key !== 'time_dt' && key !== 'prediction_type' && key !== 'user' && key !== 'sequence_idx');
        
      const targetType = targetColumn === 'average_usage_cpu' ? 'cpu' : 'memory';
      
      // Get min and max time from the predictions to define the range
      const times = predictions.map(p => dayjs(p.time_dt).toDate());
      const minTime = dayjs(Math.min(...times.map(t => t.getTime()))).toDate();
      const maxTime = dayjs(Math.max(...times.map(t => t.getTime()))).toDate();
      
      // Get min and max sequence index
      const minIdx = Math.min(...predictions.map(p => p.sequence_idx));
      const maxIdx = Math.max(...predictions.map(p => p.sequence_idx));
      
      // Calculate the expected step from the sequence indices
      const calculatedStep = Math.floor(minIdx / 1000) + 1;
      
      if (step && calculatedStep !== step) {
        logger.warn(`Step mismatch: provided step ${step}, but calculated ${calculatedStep} from sequence indices (${minIdx}-${maxIdx})`);
      }
      
      logger.info(`Processing ${predictions.length} ${targetType} predictions for user ${userId}, step ${step || calculatedStep}`);
      logger.info(`Time range: ${dayjs(minTime).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(maxTime).format('YYYY-MM-DD HH:mm:ss')}`);
      logger.info(`Sequence index range: ${minIdx} to ${maxIdx}`);
      
      // Delete existing predictions of this type in the sequence index range
      logger.info(`Deleting existing ${targetType} predictions for user ${userId} with sequence indices ${minIdx} to ${maxIdx}`);
      
      await client.query(
        'DELETE FROM predictions WHERE user_id = $1 AND prediction_type = $2 AND sequence_idx BETWEEN $3 AND $4 AND ' + 
        (targetType === 'cpu' ? 'average_usage_cpu IS NOT NULL' : 'average_usage_memory IS NOT NULL'),
        [userId, predictions[0].prediction_type, minIdx, maxIdx]
      );
      
      // Insert new predictions one by one, using ON CONFLICT to merge CPU and memory data
      for (const prediction of predictions) {
        // Use dayjs to ensure consistent timestamp format
        const timestamp = dayjs(prediction.time_dt).toDate();
        const value = prediction[targetColumn];
        const predictionType = prediction.prediction_type || 'xgboost';
        const seqIdx = prediction.sequence_idx;
        
        if (targetType === 'cpu') {
          // For CPU data
          await client.query(
            `INSERT INTO predictions 
            (time_dt, average_usage_cpu, prediction_type, user_id, sequence_idx) 
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (sequence_idx, user_id, prediction_type) 
            DO UPDATE SET 
              time_dt = CASE 
                WHEN predictions.time_dt IS NULL THEN $1 
                ELSE predictions.time_dt 
              END,
              average_usage_cpu = $2`,
            [timestamp, value, predictionType, userId, seqIdx]
          );
        } else {
          // For memory data
          await client.query(
            `INSERT INTO predictions 
            (time_dt, average_usage_memory, prediction_type, user_id, sequence_idx) 
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (sequence_idx, user_id, prediction_type) 
            DO UPDATE SET 
              time_dt = CASE 
                WHEN predictions.time_dt IS NULL THEN $1 
                ELSE predictions.time_dt 
              END,
              average_usage_memory = $2`,
            [timestamp, value, predictionType, userId, seqIdx]
          );
        }
      }
      
      // Log counts of CPU and memory predictions after import
      const { rows: cpuRows } = await client.query(
        `SELECT COUNT(*) FROM predictions 
         WHERE user_id = $1 
         AND prediction_type = $2 
         AND sequence_idx BETWEEN $3 AND $4
         AND average_usage_cpu IS NOT NULL`,
        [userId, predictions[0].prediction_type, minIdx, maxIdx]
      );
      
      const { rows: memRows } = await client.query(
        `SELECT COUNT(*) FROM predictions 
         WHERE user_id = $1 
         AND prediction_type = $2 
         AND sequence_idx BETWEEN $3 AND $4
         AND average_usage_memory IS NOT NULL`,
        [userId, predictions[0].prediction_type, minIdx, maxIdx]
      );
      
      const { rows: completeRows } = await client.query(
        `SELECT COUNT(*) FROM predictions 
         WHERE user_id = $1 
         AND prediction_type = $2 
         AND sequence_idx BETWEEN $3 AND $4
         AND average_usage_cpu IS NOT NULL 
         AND average_usage_memory IS NOT NULL`,
        [userId, predictions[0].prediction_type, minIdx, maxIdx]
      );
      
      logger.info(`After import - CPU predictions: ${cpuRows[0].count}, Memory predictions: ${memRows[0].count}, Complete records: ${completeRows[0].count}`);
      
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
  async getLatestPredictions(target = 'cpu', limit = 60, userId = null) {
    const column = target === 'cpu' ? 'average_usage_cpu' : 'average_usage_memory';
    
    try {
      let query;
      let params;
      
      if (userId) {
        // Query with user filter
        query = `
          SELECT time_dt, ${column}, prediction_type, sequence_idx
          FROM predictions
          WHERE ${column} IS NOT NULL AND user_id = $1
          ORDER BY sequence_idx ASC
          LIMIT $2
        `;
        params = [userId, limit];
      } else {
        // Query without user filter (system user or all)
        query = `
          SELECT time_dt, ${column}, prediction_type, sequence_idx
          FROM predictions
          WHERE ${column} IS NOT NULL
          ORDER BY sequence_idx ASC
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
   * @param {number} predictionLimit - Number of prediction points (default 60, controlled by frontend time window)
   * @param {number} userId - User ID (optional)
   * @returns {Promise<Object>} - Object with historical and prediction data
   */
  async getDataAndPredictions(target = 'cpu', historyLimit = 25, predictionLimit = 60, userId = null) {
    try {
      const column = target === 'cpu' ? 'average_usage_cpu' : 'average_usage_memory';
      const currentTime = dayjs().toDate();
      
      // Get historical data - before current time
      let historyQuery;
      let historyParams;
      
      if (userId) {
        historyQuery = `
          SELECT time_dt, ${column}
          FROM historical_data
          WHERE ${column} IS NOT NULL AND user_id = $1 AND time_dt <= $2
          ORDER BY time_dt DESC
          LIMIT $3
        `;
        historyParams = [userId, currentTime, historyLimit];
      } else {
        historyQuery = `
          SELECT time_dt, ${column}
          FROM historical_data
          WHERE ${column} IS NOT NULL AND time_dt <= $2
          ORDER BY time_dt DESC
          LIMIT $1
        `;
        historyParams = [historyLimit, currentTime];
      }
      
      const historyResult = await db.query(historyQuery, historyParams);
      
      // Get predictions - using sequence_idx as primary sort key
      let predictionsQuery;
      let predictionsParams;
      
      if (userId) {
        // Get the most recent prediction type for this user
        const typeResult = await db.query(
          `SELECT DISTINCT prediction_type 
           FROM predictions
           WHERE user_id = $1 
           ORDER BY prediction_type
           LIMIT 1`,
          [userId]
        );
        
        const predictionType = typeResult.rows.length > 0 ? typeResult.rows[0].prediction_type : 'xgboost';
        
        predictionsQuery = `
          SELECT time_dt, ${column}, prediction_type, sequence_idx
          FROM predictions
          WHERE ${column} IS NOT NULL 
            AND user_id = $1 
            AND prediction_type = $2
          ORDER BY sequence_idx ASC
          LIMIT $3
        `;
        predictionsParams = [userId, predictionType, predictionLimit];
      } else {
        predictionsQuery = `
          SELECT time_dt, ${column}, prediction_type, sequence_idx
          FROM predictions
          WHERE ${column} IS NOT NULL 
          ORDER BY sequence_idx ASC
          LIMIT $1
        `;
        predictionsParams = [predictionLimit];
      }
      
      const predictionsResult = await db.query(predictionsQuery, predictionsParams);
      
      // Add the sequence index as a field in the result for debugging
      const predictions = predictionsResult.rows.map(row => ({
        ...row,
        step: Math.floor(row.sequence_idx / 1000) + 1
      }));
      
      return {
        historical: historyResult.rows.reverse(), // Return in chronological order
        predictions: predictions,
        currentTime: currentTime
      };
    } catch (error) {
      logger.error(`Error fetching ${target} data and predictions:`, error);
      throw error;
    }
  }
}

module.exports = new PredictionService(); 