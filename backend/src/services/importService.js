const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');
const { pipeline } = require('stream');
const logger = require('../utils/logger');
const db = require('../utils/db');
const config = require('../config/config');
const userService = require('./userService');

class ImportService {
  /**
   * Check if a file has already been imported for a user
   * @param {string} fileName - Name of the file
   * @param {number} userId - User ID
   * @returns {Promise<boolean>} - True if the file has already been imported
   */
  async isFileAlreadyImported(fileName, userId) {
    try {
      const { rows } = await db.query(
        'SELECT id FROM imported_files WHERE file_name = $1 AND user_id = $2',
        [fileName, userId]
      );
      
      return rows.length > 0;
    } catch (error) {
      logger.error(`Error checking if file ${fileName} is already imported:`, error);
      throw error;
    }
  }
  
  /**
   * Record an imported file
   * @param {string} fileName - Name of the file
   * @param {number} userId - User ID
   * @param {number} recordCount - Number of records imported
   * @returns {Promise<Object>} - Imported file record
   */
  async recordImportedFile(fileName, userId, recordCount) {
    try {
      const { rows } = await db.query(
        'INSERT INTO imported_files (file_name, user_id, record_count) VALUES ($1, $2, $3) RETURNING *',
        [fileName, userId, recordCount]
      );
      
      logger.info(`Recorded imported file ${fileName} for user ${userId}`);
      return rows[0];
    } catch (error) {
      logger.error(`Error recording imported file ${fileName}:`, error);
      throw error;
    }
  }
  
  /**
   * Pre-scan CSV file to extract all unique users
   * @param {string} filePath - Path to the CSV file
   * @returns {Promise<Object>} - Map of usernames to user IDs
   */
  async scanUsersInCsvFile(filePath) {
    return new Promise((resolve, reject) => {
      const userMap = new Map();
      const usersToProcess = new Set();
      
      fs.createReadStream(filePath)
        .on('error', (err) => {
          logger.error(`Error reading file ${filePath}:`, err);
          reject(err);
        })
        .pipe(csv())
        .on('data', (data) => {
          // Check if user column exists
          if (data.user) {
            usersToProcess.add(data.user);
          }
        })
        .on('end', () => {
          resolve(Array.from(usersToProcess));
        })
        .on('error', (err) => {
          logger.error(`Error processing CSV ${filePath}:`, err);
          reject(err);
        });
    });
  }
  
  /**
   * Import CSV file into the database
   * @param {string} filePath - Path to the CSV file
   * @param {string} tableName - Name of the table to import into
   * @returns {Promise<Object>} - Import results
   */
  async importCsvToDb(filePath, tableName) {
    const fileName = path.basename(filePath);
    logger.info(`Starting import of ${filePath} into ${tableName}`);
    
    try {
      // First scan to identify all users in the file
      const uniqueUsers = await this.scanUsersInCsvFile(filePath);
      logger.info(`Found ${uniqueUsers.length} unique users in ${fileName}`);
      
      if (uniqueUsers.length === 0) {
        logger.warn(`No users found in ${fileName}, using 'system' as default`);
        uniqueUsers.push('system');
      }
      
      // Create a map of username -> user records and track already imported files
      const userMap = new Map();
      const alreadyImportedForUsers = new Set();
      
      for (const username of uniqueUsers) {
        const user = await userService.getOrCreateUser(username);
        userMap.set(username, user);
        
        // Check if this file has already been imported for this user
        const isAlreadyImported = await this.isFileAlreadyImported(fileName, user.id);
        if (isAlreadyImported) {
          logger.info(`File ${fileName} already imported for user ${username}, skipping`);
          alreadyImportedForUsers.add(username);
        }
      }
      
      // Prepare result object
      const results = {
        imported: 0,
        skipped: 0,
        userStats: {},
        fileName
      };
      
      // Initialize user stats for all users
      for (const username of userMap.keys()) {
        results.userStats[username] = {
          imported: 0,
          skipped: 0
        };
      }
      
      // Process the file in a non-blocking way
      return new Promise((resolve, reject) => {
        // Store records for batch processing
        const recordBatches = new Map();
        const usersWithImportedRecords = new Set();
        
        // Create a queue for batch processing to avoid async issues in stream processing
        const processBatchQueue = [];
        
        // Process a batch of records for a user
        const processBatch = async (username, userId, records) => {
          try {
            await this.batchInsert(records, tableName, userId);
            results.imported += records.length;
            results.userStats[username].imported += records.length;
            return true;
          } catch (error) {
            logger.error(`Error processing batch for user ${username}:`, error);
            return false;
          }
        };
        
        // Process the stream
        fs.createReadStream(filePath)
          .on('error', (err) => {
            logger.error(`Error reading file ${filePath}:`, err);
            reject(err);
          })
          .pipe(csv())
          .on('data', (data) => {
            // Process each record synchronously within the data event
            let username = data.user || 'system';
            
            // Get user from map
            let user = userMap.get(username);
            if (!user) {
              // Skip records for users not in our pre-scanned list
              // This is unexpected but we handle it gracefully
              logger.warn(`Unexpected user ${username} found in file, skipping record`);
              results.skipped++;
              return;
            }
            
            const userId = user.id;
            
            // Skip if already imported
            if (alreadyImportedForUsers.has(username)) {
              results.skipped++;
              results.userStats[username].skipped++;
              return;
            }
            
            // Add record to batch for this user
            if (!recordBatches.has(userId)) {
              recordBatches.set(userId, []);
            }
            
            recordBatches.get(userId).push(data);
            usersWithImportedRecords.add(username);
            
            // If we've reached batch size, queue a batch job
            if (recordBatches.get(userId).length >= 1000) {
              const batchToProcess = [...recordBatches.get(userId)];
              recordBatches.set(userId, []);
              
              // Add to processing queue instead of processing directly
              processBatchQueue.push(() => processBatch(username, userId, batchToProcess));
            }
          })
          .on('end', async () => {
            try {
              logger.info(`Finished reading file ${fileName}, processing remaining batches...`);
              
              // Process any batches that were queued during stream processing
              if (processBatchQueue.length > 0) {
                logger.info(`Processing ${processBatchQueue.length} queued batches...`);
                for (const batchFn of processBatchQueue) {
                  await batchFn();
                }
              }
              
              // Process any remaining records for each user
              for (const [username, user] of userMap.entries()) {
                // Skip users who have already imported this file
                if (alreadyImportedForUsers.has(username)) {
                  continue;
                }
                
                const userId = user.id;
                
                // Only process users with records
                if (recordBatches.has(userId) && recordBatches.get(userId).length > 0) {
                  logger.debug(`Processing remaining batch for user ${username} with ${recordBatches.get(userId).length} records`);
                  await processBatch(username, userId, recordBatches.get(userId));
                }
              }
              
              // Record import information in the database
              logger.info(`Recording import information for file ${fileName}...`);
              for (const username of usersWithImportedRecords) {
                // Only record import information for users with actual imported records
                if (results.userStats[username]?.imported > 0) {
                  const user = userMap.get(username);
                  logger.debug(`Recording import for user ${username} with ${results.userStats[username].imported} records`);
                  await this.recordImportedFile(fileName, user.id, results.userStats[username].imported);
                }
              }
              
              logger.info(`Successfully imported ${results.imported} records, skipped ${results.skipped} records from ${filePath}`);
              resolve(results);
            } catch (error) {
              logger.error(`Error in file import process:`, error);
              reject(error);
            }
          })
          .on('error', (err) => {
            logger.error(`Error processing CSV ${filePath}:`, err);
            reject(err);
          });
      });
    } catch (error) {
      logger.error(`Error importing file ${filePath}:`, error);
      throw error;
    }
  }
  
  /**
   * Insert a batch of records into the database
   * @param {Array} records - Array of records to insert
   * @param {string} tableName - Table name
   * @param {number} userId - User ID
   */
  async batchInsert(records, tableName, userId) {
    // Validate table name
    if (tableName !== 'historical_data' && tableName !== 'predictions') {
      throw new Error(`Invalid table name: ${tableName}`);
    }
    
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (const record of records) {
        // Process timestamp
        let timestamp;
        if (record.time_dt) {
          timestamp = new Date(record.time_dt);
        } else if (record.timestamp) {
          timestamp = new Date(record.timestamp);
        } else {
          timestamp = new Date();
        }
        
        // Check if timestamp is valid
        if (isNaN(timestamp.getTime())) {
          logger.warn(`Invalid timestamp in record: ${JSON.stringify(record)}`);
          continue;
        }
        
        const cpuValue = parseFloat(record.average_usage_cpu) || null;
        const memValue = parseFloat(record.average_usage_memory) || null;
        
        // For predictions table, we need prediction_type
        if (tableName === 'predictions') {
          const predictionType = record.prediction_type || 'xgboost';
          
          await client.query(
            `INSERT INTO predictions 
            (time_dt, average_usage_cpu, average_usage_memory, prediction_type, user_id) 
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (time_dt, user_id, prediction_type) DO NOTHING`,
            [timestamp, cpuValue, memValue, predictionType, userId]
          );
        } else {
          // Historical data
            await client.query(
              `INSERT INTO historical_data 
              (time_dt, average_usage_cpu, average_usage_memory, user_id) 
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (time_dt, user_id) DO NOTHING`,
              [timestamp, cpuValue, memValue, userId]
            );
        }
      }
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Error in batch insert:', err);
      throw err;
    } finally {
      client.release();
    }
  }
  
  /**
   * Get available CSV files in the data directory
   * @param {string} directory - Directory path
   * @returns {Promise<Array>} - Array of file names
   */
  async getAvailableCsvFiles(directory = config.dataPath) {
    try {
      return fs.readdirSync(directory)
        .filter(file => file.endsWith('.csv'))
        .map(file => ({
          fileName: file,
          filePath: path.join(directory, file)
        }));
    } catch (error) {
      logger.error(`Error reading directory ${directory}:`, error);
      throw error;
    }
  }
  
  /**
   * Import all CSV files from a directory
   * @param {string} directory - Directory path
   * @returns {Promise<Object>} - Import results
   */
  async importAllCsvFiles(directory = config.dataPath) {
    logger.info(`Importing all CSV files from ${directory}`);
    
    try {
      const files = await this.getAvailableCsvFiles(directory);
      logger.info(`Found ${files.length} files to import`);
      const results = {
        success: 0,
        failed: 0,
        skipped: 0,
        files: []
      };
      
      for (const { fileName, filePath } of files) {
        try {
          const importResult = await this.importCsvToDb(filePath, 'historical_data');
          
          if (importResult.imported > 0) {
            results.success++;
          } else if (importResult.skipped > 0 && importResult.imported === 0) {
            results.skipped++;
          }
          
          results.files.push({ 
            file: fileName, 
            status: importResult.imported > 0 ? 'success' : 'skipped',
            imported: importResult.imported,
            skipped: importResult.skipped,
            userStats: importResult.userStats
          });
        } catch (err) {
          results.failed++;
          results.files.push({ 
            file: fileName, 
            status: 'failed', 
            error: err.message 
          });
        }
      }
      
      logger.info(`Import complete. Success: ${results.success}, Failed: ${results.failed}, Skipped: ${results.skipped}`);
      return results;
    } catch (err) {
      logger.error(`Error importing files from ${directory}:`, err);
      throw err;
    }
  }
  
  /**
   * Import a specific CSV file
   * @param {string} fileName - Name of the file to import
   * @param {string} directory - Directory path
   * @returns {Promise<Object>} - Import results
   */
  async importSpecificFile(fileName, directory = config.dataPath) {
    logger.info(`Importing specific CSV file: ${fileName} from ${directory}`);
    
    try {
      // Validate file name to prevent directory traversal
      if (!fileName || fileName.includes('..') || fileName.includes('/')) {
        throw new Error('Invalid file name');
      }
      
      // Verify file exists and ends with .csv
      if (!fileName.endsWith('.csv')) {
        throw new Error('File must be a CSV file');
      }
      
      const filePath = path.join(directory, fileName);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File ${fileName} not found`);
      }
      
      const importResult = await this.importCsvToDb(filePath, 'historical_data');
      
      const result = {
        success: importResult.imported > 0 ? 1 : 0,
        failed: 0,
        skipped: importResult.imported === 0 && importResult.skipped > 0 ? 1 : 0,
        files: [{ 
          file: fileName, 
          status: importResult.imported > 0 ? 'success' : 'skipped',
          imported: importResult.imported,
          skipped: importResult.skipped,
          userStats: importResult.userStats
        }]
      };
      
      logger.info(`Import of ${fileName} complete. Success: ${result.success}, Skipped: ${result.skipped}`);
      return result;
    } catch (err) {
      logger.error(`Error importing specific file ${fileName}:`, err);
      throw err;
    }
  }
}

module.exports = new ImportService(); 