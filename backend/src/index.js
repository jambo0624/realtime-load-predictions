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
const dataService = require('./services/dataService');

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

// Update historical data timestamps and run new prediction every day at 00:00 AM
//schedule.scheduleJob('0 0 * * *', async function() {
//  try {
//    console.log('Updating historical data timestamps...');
//    await dataService.updateHistoricalDataTimestamps();
    
//    console.log('Running prediction with updated data...');
//    await predictionService.runPrediction('your_data_file.csv');
//  } catch (err) {
//    console.error('Daily data update failed:', err);
//  }
//});

// Start the server
startServer(); 