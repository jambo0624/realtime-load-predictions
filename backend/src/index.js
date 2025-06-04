const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const schedule = require('node-schedule');
const config = require('./config/config');
const logger = require('./utils/logger');
const db = require('./utils/db');
const dataRoutes = require('./routes/dataRoutes');
const websocketService = require('./services/websocketService');
const predictionService = require('./services/predictionService');

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Log all requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/data', dataRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
websocketService.init(server);

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database tables
    const dbInitialized = await db.initDatabase();
    if (!dbInitialized) {
      logger.error('Failed to initialize database tables');
      process.exit(1);
    }
    
    // Start server
    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port}`);
    });
    
    // Handle graceful shutdown
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    logger.error('Error starting server:', err);
    process.exit(1);
  }
}

// Graceful shutdown function
function shutdown() {
  logger.info('Shutting down server...');
  
  // Close WebSocket connections
  websocketService.cleanup();
  
  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close database pool
    db.pool.end(() => {
      logger.info('Database connections closed');
      process.exit(0);
    });
  });
  
  // Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Update historical data and reset predictions every day at 00:00 AM
schedule.scheduleJob('0 0 * * *', async function() {
  try {
    logger.info('Starting daily data reset process...');
    
    // Get all users
    const usersResult = await db.query('SELECT id FROM users');
    const users = usersResult.rows;
    
    // For each user, perform the reset process
    for (const user of users) {
      const userId = user.id;
      
      // Step 1: Clear all predictions for this user
      logger.info(`Clearing predictions for user ${userId}...`);
      const clearResult = await db.clearPredictions(userId);
      logger.info(`Cleared ${clearResult.count} prediction records`);
      
      // Step 2: Reset historical data from original historical data
      logger.info(`Resetting historical data for user ${userId}...`);
      const resetResult = await db.copyOriginalToHistorical(userId);
      logger.info(`Reset complete: ${resetResult.count} records copied`);
      
      // Step 3: Run initial prediction for the day
      logger.info(`Running initial prediction for user ${userId}...`);
      try {
        const predictionResult = await predictionService.runPrediction(userId);
        logger.info(`Initial prediction complete for user ${userId}: generated ${predictionResult.totalPredictions} predictions`);
      } catch (predErr) {
        logger.error(`Error running prediction for user ${userId}:`, predErr);
      }
    }
    
    logger.info('Daily data reset process completed successfully');
    
    // Notify connected clients about the data update
    websocketService.notifyDataUpdate('system', 'data_reset');
  } catch (err) {
    logger.error('Daily data reset process failed:', err);
  }
});

// Start the server
startServer(); 