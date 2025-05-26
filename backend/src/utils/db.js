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
            ON DELETE SET NULL
        )
      `);

      // Create predictions table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS predictions (
          id SERIAL PRIMARY KEY,
          time_dt TIMESTAMP NOT NULL,
          average_usage_cpu NUMERIC(10, 6),
          average_usage_memory NUMERIC(10, 6),
          user_id INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_predictions_user
            FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL
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
        CREATE INDEX IF NOT EXISTS idx_historical_time ON historical_data(time_dt);
        CREATE INDEX IF NOT EXISTS idx_predictions_time ON predictions(time_dt);
        CREATE INDEX IF NOT EXISTS idx_historical_user_id ON historical_data(user_id);
        CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
      `);

      logger.info('Database tables initialized');
      return true;
    } catch (error) {
      logger.error('Error initializing database tables:', error);
      return false;
    }
  }
}; 