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
        DROP TABLE IF EXISTS aws_accounts CASCADE;
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
      // Enable pgcrypto extension for encryption
      await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      
      // Create users table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create AWS accounts table with encrypted fields
      await pool.query(`
        CREATE TABLE IF NOT EXISTS aws_accounts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          account_id VARCHAR(12) NOT NULL,
          role_arn TEXT NOT NULL,
          external_id TEXT,
          regions TEXT[] NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          CONSTRAINT fk_aws_accounts_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,
          CONSTRAINT unique_user
            UNIQUE (user_id)
        )
      `);
      
      // Create encrypting trigger function for aws_accounts
      await pool.query(`
        CREATE OR REPLACE FUNCTION encrypt_aws_credentials()
        RETURNS TRIGGER AS $$
        BEGIN
          -- Encrypt sensitive data
          NEW.role_arn = pgp_sym_encrypt(NEW.role_arn, '${config.encryptionKey}', 'cipher-algo=aes256');
          
          IF NEW.external_id IS NOT NULL THEN
            NEW.external_id = pgp_sym_encrypt(NEW.external_id, '${config.encryptionKey}', 'cipher-algo=aes256');
          END IF;
          
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        
        DROP TRIGGER IF EXISTS encrypt_aws_credentials_trigger ON aws_accounts;
        
        CREATE TRIGGER encrypt_aws_credentials_trigger
        BEFORE INSERT OR UPDATE OF role_arn, external_id ON aws_accounts
        FOR EACH ROW EXECUTE FUNCTION encrypt_aws_credentials();
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
        
        -- Indexes for AWS accounts
        CREATE INDEX IF NOT EXISTS idx_aws_accounts_user_id ON aws_accounts(user_id);
        CREATE INDEX IF NOT EXISTS idx_aws_accounts_account_id ON aws_accounts(account_id);
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
  },
  
  /**
   * Save AWS account with IAM role credentials
   * @param {number} userId - User ID
   * @param {string} accountId - AWS account ID
   * @param {string} roleArn - IAM role ARN
   * @param {string} externalId - External ID for role assumption (optional)
   * @param {string[]} regions - AWS regions to monitor
   * @returns {Promise<Object>} - Result with created account
   */
  async saveAwsAccount(userId, accountId, roleArn, externalId, regions) {
    try {
      const query = `
        INSERT INTO aws_accounts (user_id, account_id, role_arn, external_id, regions)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) DO UPDATE
        SET account_id = $2,
            role_arn = $3,
            external_id = $4,
            regions = $5,
            updated_at = NOW(),
            enabled = TRUE
        RETURNING id, user_id, account_id, regions, enabled, created_at, updated_at
      `;
      
      const result = await pool.query(query, [userId, accountId, roleArn, externalId, regions]);
      
      logger.info(`AWS account saved for user ${userId}: Account ID ${accountId}`);
      return { success: true, account: result.rows[0] };
    } catch (error) {
      logger.error(`Error saving AWS account: ${error.message}`);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Get AWS accounts for a user
   * @param {number} userId - User ID to get accounts for
   * @returns {Promise<Object>} - Result with accounts
   */
  async getAwsAccounts(userId) {
    try {
      const query = `
        SELECT id, user_id, account_id, regions, enabled, created_at, updated_at
        FROM aws_accounts
        WHERE user_id = $1
        ORDER BY created_at DESC
      `;
      
      const result = await pool.query(query, [userId]);
      
      return { 
        success: true, 
        accounts: result.rows 
      };
    } catch (error) {
      logger.error(`Error getting AWS accounts: ${error.message}`);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Get a specific AWS account with decrypted credentials for AWS SDK
   * @param {number} accountId - Account ID
   * @returns {Promise<Object>} - Result with decrypted account credentials
   */
  async getAwsAccountCredentials(accountId) {
    try {
      const query = `
        SELECT 
          id, 
          user_id, 
          account_id, 
          pgp_sym_decrypt(role_arn, '${config.encryptionKey}', 'cipher-algo=aes256') as role_arn,
          CASE 
            WHEN external_id IS NOT NULL THEN 
              pgp_sym_decrypt(external_id, '${config.encryptionKey}', 'cipher-algo=aes256')
            ELSE NULL
          END as external_id,
          regions,
          enabled
        FROM aws_accounts
        WHERE id = $1 AND enabled = TRUE
      `;
      
      const result = await pool.query(query, [accountId]);
      
      if (result.rows.length === 0) {
        return { success: false, error: 'AWS account not found or disabled' };
      }
      
      return { success: true, account: result.rows[0] };
    } catch (error) {
      logger.error(`Error getting AWS account credentials: ${error.message}`);
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Delete an AWS account
   * @param {number} accountId - Account ID to delete
   * @param {number} userId - User ID for verification
   * @returns {Promise<Object>} - Result of deletion
   */
  async deleteAwsAccount(accountId, userId) {
    try {
      const query = `
        DELETE FROM aws_accounts
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;
      
      const result = await pool.query(query, [accountId, userId]);
      
      if (result.rows.length === 0) {
        return { success: false, error: 'AWS account not found or not owned by user' };
      }
      
      logger.info(`AWS account ${accountId} deleted for user ${userId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting AWS account: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}; 