const socketIo = require('socket.io');
const dayjs = require('dayjs');
const logger = require('../utils/logger');
const predictionService = require('./predictionService');
const userService = require('../services/userService');

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
    
    // Store user information for this socket
    socket.userData = {
      username: null
    };
    
    // Handle subscription
    socket.on('subscribe', async (data) => {
      // Extract username from data
      const username = data.username || null;
      
      // Store username for this socket
      socket.userData.username = username;
      
      // Create room name based on username
      const roomName = username ? `user_${username}` : 'default';
      
      logger.info(`Client ${socket.id} subscribed to data updates${username ? ` for user: ${username}` : ''}`);
      
      // Join room for this user
      socket.join(roomName);
      
      // Send initial data for this user
      await this.sendInitialData(socket, username);
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
   * @param {string} username - Username for filtering data
   */
  async sendInitialData(socket, username = null) {
    try {
      let userId = null;
      
      // Get user ID if username is provided
      if (username) {
        const user = await userService.getUserByUsername(username);
        if (user) {
          userId = user.id;
        } else {
          logger.warn(`User ${username} not found`);
        }
      }
      
      // Get CPU and memory data with consistent window
      // Use standard settings: 25 history points, 60 prediction points
      const cpuData = await predictionService.getDataAndPredictions('cpu', 25, 60, userId);
      const memoryData = await predictionService.getDataAndPredictions('memory', 25, 60, userId);
      
      // Make sure we use the same reference time for both
      const referenceTime = cpuData.currentTime;
      
      // Send combined data
      socket.emit('initialData', { 
        cpu: cpuData,
        memory: memoryData,
        timestamp: dayjs().toDate(),
        referenceTime,
        hasPredictions: cpuData.hasPredictions || memoryData.hasPredictions
      });
      
      logger.info(`Sent initial data to client ${socket.id}${username ? ` for user: ${username}` : ''}`);
    } catch (err) {
      logger.error(`Error sending initial data to client ${socket.id}:`, err);
    }
  }
  
  /**
   * Start periodic data updates to all connected clients
   */
  startPeriodicUpdates() {
    // Send updates every 5 seconds
    const updateInterval = 5000;
    
    this.updateInterval = setInterval(async () => {
      if (this.clients.size === 0) {
        return; // No clients connected, skip update
      }
      
      try {
        // Get all unique user rooms
        const rooms = this.io.sockets.adapter.rooms;
        
        for (const room of rooms.keys()) {
          // Skip non-user rooms (Socket.IO internal rooms)
          if (!room.startsWith('user_') && room !== 'default') {
            continue;
          }
          
          let username = null;
          let userId = null;
          
          // Extract username if present (format: user_username)
          if (room !== 'default') {
            username = room.substring(5); // Remove 'user_' prefix
            
            // Get user ID
            const user = await userService.getUserByUsername(username);
            if (user) {
              userId = user.id;
            } else {
              logger.warn(`User ${username} not found for room ${room}`);
              continue;
            }
          }
          
          // Get CPU and memory data for this user with consistent window settings
          const cpuData = await predictionService.getDataAndPredictions('cpu', 25, 60, userId);
          const memoryData = await predictionService.getDataAndPredictions('memory', 25, 60, userId);
          
          // Make sure we use the same reference time for both
          const referenceTime = cpuData.currentTime;
          const currentTime = dayjs().toDate();
          
          // Send combined data update
          this.io.to(room).emit('dataUpdate', {
            cpu: cpuData,
            memory: memoryData,
            timestamp: currentTime,
            referenceTime,
            hasPredictions: cpuData.hasPredictions || memoryData.hasPredictions
          });
          
          logger.debug(`Sent data update to room ${room}`);
        }
        
        logger.debug(`Completed updates for ${this.clients.size} clients`);
      } catch (err) {
        logger.error('Error sending periodic updates:', err);
      }
    }, updateInterval);
    
    logger.info(`Started periodic updates every ${updateInterval}ms`);
  }
  
  /**
   * Notify clients about data updates
   * @param {string} username - Username for filtering notifications (or 'system' for all)
   * @param {string} event - Event type (e.g., 'data_reset', 'new_prediction')
   * @param {Object} data - Additional data to send
   */
  notifyDataUpdate(username, event, data = {}) {
    if (!this.io) return;
    
    if (username === 'system') {
      // Broadcast to all clients
      this.io.emit('dataEvent', { 
        event,
        data,
        timestamp: dayjs().toDate()
      });
      logger.info(`Broadcast ${event} event to all clients`);
    } else {
      // Send to specific user room
      const roomName = `user_${username}`;
      this.io.to(roomName).emit('dataEvent', {
        event,
        data,
        timestamp: dayjs().toDate()
      });
      logger.info(`Sent ${event} event to room ${roomName}`);
    }
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