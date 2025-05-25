const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');
const { pipeline } = require('stream');
const logger = require('../utils/logger');
const db = require('../utils/db');
const config = require('../config/config');

class ImportService {
  /**
   * Import CSV file into the database
   * @param {string} filePath - Path to the CSV file
   * @param {string} tableName - Name of the table to import into
   * @returns {Promise<number>} - Number of records imported
   */
  async importCsvToDb(filePath, tableName) {
    logger.info(`Starting import of ${filePath} into ${tableName}`);
    
    return new Promise((resolve, reject) => {
      const results = [];
      let rowCount = 0;
      
      fs.createReadStream(filePath)
        .on('error', (err) => {
          logger.error(`Error reading file ${filePath}:`, err);
          reject(err);
        })
        .pipe(csv())
        .on('data', (data) => {
          results.push(data);
          rowCount++;
          
          // Process in batches to avoid memory issues
          if (results.length >= 1000) {
            this.batchInsert(results, tableName);
            results.length = 0; // Clear array
          }
        })
        .on('end', async () => {
          // Insert any remaining records
          if (results.length > 0) {
            await this.batchInsert(results, tableName);
          }
          
          logger.info(`Successfully imported ${rowCount} records from ${filePath} into ${tableName}`);
          resolve(rowCount);
        })
        .on('error', (err) => {
          logger.error(`Error processing CSV ${filePath}:`, err);
          reject(err);
        });
    });
  }
  
  /**
   * Insert a batch of records into the database
   * @param {Array} records - Array of records to insert
   * @param {string} tableName - Table name
   */
  async batchInsert(records, tableName) {
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
            (time_dt, average_usage_cpu, average_usage_memory, prediction_type) 
            VALUES ($1, $2, $3, $4)`,
            [timestamp, cpuValue, memValue, predictionType]
          );
        } else {
          // Historical data
          await client.query(
            `INSERT INTO historical_data 
            (time_dt, average_usage_cpu, average_usage_memory) 
            VALUES ($1, $2, $3)`,
            [timestamp, cpuValue, memValue]
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
   * Import all CSV files from a directory
   * @param {string} directory - Directory path
   * @returns {Promise<Object>} - Import results
   */
  async importAllCsvFiles(directory = config.dataPath) {
    logger.info(`Importing all CSV files from ${directory}`);
    
    const results = {
      success: 0,
      failed: 0,
      files: []
    };
    
    try {
      const files = fs.readdirSync(directory)
        .filter(file => file.endsWith('.csv'));
      
      for (const file of files) {
        const filePath = path.join(directory, file);
        try {
          const rowCount = await this.importCsvToDb(filePath, 'historical_data');
          results.success++;
          results.files.push({ file, status: 'success', rowCount });
        } catch (err) {
          results.failed++;
          results.files.push({ file, status: 'failed', error: err.message });
        }
      }
      
      logger.info(`Import complete. Success: ${results.success}, Failed: ${results.failed}`);
      return results;
    } catch (err) {
      logger.error(`Error reading directory ${directory}:`, err);
      throw err;
    }
  }
}

module.exports = new ImportService(); 