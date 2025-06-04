const { Pool } = require('pg');
const config = require('../config/config');
const logger = require('./logger');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Database connection error:', err.message);
  } else {
    logger.info('Database connected successfully at', res.rows[0].now);
  }
});

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
  
  // Reset database tables (development environment only!)
  async resetDatabase() {
    try {
      // Drop all tables
      await pool.query(`
        DROP TABLE IF EXISTS imported_files CASCADE;
        DROP TABLE IF EXISTS predictions CASCADE;
        DROP TABLE IF EXISTS historical_data CASCADE;
        DROP TABLE IF EXISTS original_historical_data CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);
      
      logger.info('Database tables dropped');
      
      // Recreate all tables
      const result = await this.initDatabase();
      
      return {
        success: result,
        message: result ? 'Database reset successfully' : 'Error resetting database'
      };
    } catch (error) {
      logger.error('Error resetting database tables:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  // Initialize database tables
  async initDatabase() {
    try {
      // Create users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create historical data table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS historical_data (
          id SERIAL PRIMARY KEY,
          time_dt TIMESTAMP NOT NULL,
          average_usage_cpu NUMERIC(10, 6),
          average_usage_memory NUMERIC(10, 6),
          user_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_historical_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL,
          CONSTRAINT unique_historical_time_user
            UNIQUE (time_dt, user_id)
        )
      `);
      
      // Create original historical data table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS original_historical_data (
          id SERIAL PRIMARY KEY,
          time_dt TIMESTAMP NOT NULL,
          average_usage_cpu NUMERIC(10, 6),
          average_usage_memory NUMERIC(10, 6),
          user_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_original_historical_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL,
          CONSTRAINT unique_original_historical_time_user
            UNIQUE (time_dt, user_id)
        )
      `);

      // Create predictions table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS predictions (
          id SERIAL PRIMARY KEY,
          time_dt TIMESTAMP NOT NULL,
          average_usage_cpu NUMERIC(10, 6),
          average_usage_memory NUMERIC(10, 6),
          prediction_type VARCHAR(50) DEFAULT 'xgboost',
          user_id INTEGER,
          sequence_idx INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_predictions_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL,
          CONSTRAINT unique_prediction_time_user_type
            UNIQUE (time_dt, user_id, prediction_type),
          CONSTRAINT unique_prediction_seq_user_type
            UNIQUE (sequence_idx, user_id, prediction_type)
        )
      `);

      // Create imported files table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS imported_files (
          id SERIAL PRIMARY KEY,
          file_name VARCHAR(255) NOT NULL,
          user_id INTEGER,
          record_count INTEGER NOT NULL,
          imported_at TIMESTAMP DEFAULT NOW(),
          CONSTRAINT fk_imported_files_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL,
          CONSTRAINT unique_file_per_user 
            UNIQUE(file_name, user_id)
        )
      `);

      // Create indexes for better performance
      await pool.query(`
        -- Basic indexes
        CREATE INDEX IF NOT EXISTS idx_historical_time ON historical_data(time_dt);
        CREATE INDEX IF NOT EXISTS idx_predictions_time ON predictions(time_dt);
        CREATE INDEX IF NOT EXISTS idx_historical_user_id ON historical_data(user_id);
        CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
        
        -- Indexes for original historical data
        CREATE INDEX IF NOT EXISTS idx_original_historical_time ON original_historical_data(time_dt);
        CREATE INDEX IF NOT EXISTS idx_original_historical_user_id ON original_historical_data(user_id);
      `);

      logger.info('Database tables initialized');
      return true;
    } catch (error) {
      logger.error('Error initializing database tables:', error);
      return false;
    }
  },
  
  /**
   * Copy data from original_historical_data to historical_data
   * Used for daily reset of historical data
   * @param {number} userId - User ID to reset data for
   * @returns {Promise<Object>} - Result with count of copied records
   */
  async copyOriginalToHistorical(userId) {
    try {
      // First clear existing historical data for this user
      const deleteResult = await pool.query(
        'DELETE FROM historical_data WHERE user_id = $1',
        [userId]
      );
      
      // Then copy from original_historical_data to historical_data
      const result = await pool.query(
        `INSERT INTO historical_data (time_dt, average_usage_cpu, average_usage_memory, user_id)
         SELECT time_dt, average_usage_cpu, average_usage_memory, user_id
         FROM original_historical_data
         WHERE user_id = $1
         ORDER BY time_dt`,
        [userId]
      );
      
      logger.info(`Reset historical data for user ${userId}: ${result.rowCount} records copied`);
      return { success: true, count: result.rowCount };
    } catch (error) {
      logger.error(`Error copying original historical data: ${error.message}`);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Update historical_data with prediction results
   * @param {number} userId - User ID to update data for
   * @param {string} predictionType - Type of prediction to use (e.g., 'xgboost')
   * @param {number} count - Number of prediction records to use
   * @returns {Promise<Object>} - Result with count of updated records
   */
  async updateHistoricalWithPredictions(userId, predictionType, count) {
    try {
      // First remove oldest records from historical_data
      const deleteResult = await pool.query(
        `DELETE FROM historical_data 
         WHERE id IN (
           SELECT id FROM historical_data 
           WHERE user_id = $1 
           ORDER BY time_dt ASC 
           LIMIT $2
         )`,
        [userId, count]
      );
      
      // Then insert newest predictions into historical_data
      const result = await pool.query(
        `INSERT INTO historical_data (time_dt, average_usage_cpu, average_usage_memory, user_id)
         SELECT time_dt, average_usage_cpu, average_usage_memory, user_id
         FROM predictions
         WHERE user_id = $1 AND prediction_type = $2
         ORDER BY time_dt ASC
         LIMIT $3`,
        [userId, predictionType, count]
      );
      
      logger.info(`Updated historical data for user ${userId}: ${result.rowCount} prediction records added`);
      return { success: true, count: result.rowCount };
    } catch (error) {
      logger.error(`Error updating historical data with predictions: ${error.message}`);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Clear predictions for a specific user
   * @param {number} userId - User ID to clear predictions for
   * @param {string} [predictionType] - Optional prediction type filter
   * @returns {Promise<Object>} - Result with count of deleted records
   */
  async clearPredictions(userId, predictionType = null) {
    try {
      let query = 'DELETE FROM predictions WHERE user_id = $1';
      let params = [userId];
      
      if (predictionType) {
        query += ' AND prediction_type = $2';
        params.push(predictionType);
      }
      
      const result = await pool.query(query, params);
      
      logger.info(`Cleared predictions for user ${userId}${predictionType ? ` of type ${predictionType}` : ''}: ${result.rowCount} records deleted`);
      return { success: true, count: result.rowCount };
    } catch (error) {
      logger.error(`Error clearing predictions: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}; 