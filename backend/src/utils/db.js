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
      // Create historical data table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS historical_data (
          id SERIAL PRIMARY KEY,
          time_dt TIMESTAMP NOT NULL,
          average_usage_cpu NUMERIC(10, 6),
          average_usage_memory NUMERIC(10, 6),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create predictions table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS predictions (
          id SERIAL PRIMARY KEY,
          time_dt TIMESTAMP NOT NULL,
          average_usage_cpu NUMERIC(10, 6),
          average_usage_memory NUMERIC(10, 6),
          prediction_type VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      logger.info('Database tables initialized');
      return true;
    } catch (error) {
      logger.error('Error initializing database tables:', error);
      return false;
    }
  }
}; 