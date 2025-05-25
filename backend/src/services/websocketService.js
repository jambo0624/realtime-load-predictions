const socketIo = require('socket.io');
const logger = require('../utils/logger');
const predictionService = require('./predictionService');

class WebsocketService {
  constructor() {
    this.io = null;
    this.clients = new Set();
    this.updateInterval = null;
  }
  
  /**
   * Initialize the WebSocket server
   * @param {Object} server - HTTP server instance
   */
  init(server) {
    this.io = socketIo(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    logger.info('WebSocket server initialized');
    
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    
    // Start sending updates periodically
    this.startPeriodicUpdates();
  }
  
  /**
   * Handle new client connection
   * @param {Object} socket - Socket.io socket instance
   */
  handleConnection(socket) {
    logger.info(`New client connected: ${socket.id}`);
    this.clients.add(socket.id);
    
    // Send initial data
    this.sendInitialData(socket);
    
    // Handle subscription to specific target (cpu/memory)
    socket.on('subscribe', (target) => {
      logger.info(`Client ${socket.id} subscribed to ${target} updates`);
      socket.join(target);
      this.sendDataForTarget(socket, target);
    });
    
    // Handle client disconnection
    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
      this.clients.delete(socket.id);
    });
  }
  
  /**
   * Send initial data to a newly connected client
   * @param {Object} socket - Socket.io socket instance
   */
  async sendInitialData(socket) {
    try {
      // Send CPU data
      const cpuData = await predictionService.getDataAndPredictions('cpu', 50, 24);
      socket.emit('initialData', { 
        target: 'cpu',
        data: cpuData
      });
      
      // Send Memory data
      const memoryData = await predictionService.getDataAndPredictions('memory', 50, 24);
      socket.emit('initialData', { 
        target: 'memory',
        data: memoryData
      });
      
      logger.info(`Sent initial data to client ${socket.id}`);
    } catch (err) {
      logger.error(`Error sending initial data to client ${socket.id}:`, err);
    }
  }
  
  /**
   * Send data for a specific target to a client
   * @param {Object} socket - Socket.io socket instance
   * @param {string} target - Target variable (cpu/memory)
   */
  async sendDataForTarget(socket, target) {
    try {
      const data = await predictionService.getDataAndPredictions(target, 50, 24);
      socket.emit('dataUpdate', { 
        target,
        data
      });
    } catch (err) {
      logger.error(`Error sending ${target} data to client ${socket.id}:`, err);
    }
  }
  
  /**
   * Start periodic data updates to all connected clients
   */
  startPeriodicUpdates() {
    // Send updates every 10 seconds
    const updateInterval = 10000;
    
    this.updateInterval = setInterval(async () => {
      if (this.clients.size === 0) {
        return; // No clients connected, skip update
      }
      
      try {
        // Get latest CPU data
        const cpuData = await predictionService.getDataAndPredictions('cpu', 50, 24);
        this.io.to('cpu').emit('dataUpdate', {
          target: 'cpu',
          data: cpuData,
          timestamp: new Date()
        });
        
        // Get latest Memory data
        const memoryData = await predictionService.getDataAndPredictions('memory', 50, 24);
        this.io.to('memory').emit('dataUpdate', {
          target: 'memory',
          data: memoryData,
          timestamp: new Date()
        });
        
        logger.debug(`Sent data updates to ${this.clients.size} clients`);
      } catch (err) {
        logger.error('Error sending periodic updates:', err);
      }
    }, updateInterval);
    
    logger.info(`Started periodic updates every ${updateInterval}ms`);
  }
  
  /**
   * Stop periodic updates
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      logger.info('Stopped periodic updates');
    }
  }
  
  /**
   * Send a notification to all connected clients
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   */
  broadcastNotification(type, data) {
    if (this.io) {
      this.io.emit('notification', { type, data, timestamp: new Date() });
      logger.info(`Sent ${type} notification to all clients`);
    }
  }
  
  /**
   * Clean up resources
   */
  cleanup() {
    this.stopPeriodicUpdates();
    if (this.io) {
      this.io.close();
      this.io = null;
      logger.info('WebSocket server closed');
    }
  }
}

module.exports = new WebsocketService(); 