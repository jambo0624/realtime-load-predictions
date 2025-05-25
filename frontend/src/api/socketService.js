import { io } from 'socket.io-client';

/**
 * Socket.io service for real-time data updates
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.callbacks = {
      initialData: new Set(),
      dataUpdate: new Set(),
      notification: new Set(),
      connect: new Set(),
      disconnect: new Set(),
      error: new Set()
    };
  }

  /**
   * Connect to WebSocket server
   * @param {string} url - Server URL (default: window.location.origin)
   */
  connect(url = process.env.REACT_APP_SOCKET_URL || 'http://localhost:8080') {
    // Disconnect if already connected
    if (this.socket) {
      this.disconnect();
    }

    // Connect to socket.io server
    this.socket = io(url, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['websocket']
    });

    // Set up event listeners
    this.socket.on('connect', () => {
      console.log('WebSocket connected');
      this.callbacks.connect.forEach(callback => callback());
    });

    this.socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      this.callbacks.disconnect.forEach(callback => callback());
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.callbacks.error.forEach(callback => callback(error));
    });

    this.socket.on('initialData', (data) => {
      console.log(`Initial ${data.target} data received`);
      this.callbacks.initialData.forEach(callback => callback(data));
    });

    this.socket.on('dataUpdate', (data) => {
      // console.log(`${data.target} data update received`);
      this.callbacks.dataUpdate.forEach(callback => callback(data));
    });

    this.socket.on('notification', (notification) => {
      console.log(`Notification received: ${notification.type}`);
      this.callbacks.notification.forEach(callback => callback(notification));
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('WebSocket disconnected');
    }
  }

  /**
   * Subscribe to a specific data target
   * @param {string} target - Data target ('cpu' or 'memory')
   */
  subscribeToTarget(target) {
    if (!this.socket) {
      console.error('WebSocket not connected');
      return;
    }

    this.socket.emit('subscribe', target);
    console.log(`Subscribed to ${target} updates`);
  }

  /**
   * Register an event callback
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  on(event, callback) {
    if (!this.callbacks[event]) {
      console.error(`Unknown event: ${event}`);
      return;
    }

    this.callbacks[event].add(callback);
  }

  /**
   * Remove an event callback
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    if (!this.callbacks[event]) {
      console.error(`Unknown event: ${event}`);
      return;
    }

    this.callbacks[event].delete(callback);
  }

  /**
   * Check if WebSocket is connected
   * @returns {boolean} - Connection status
   */
  isConnected() {
    return this.socket && this.socket.connected;
  }
}

// Create a singleton instance
const socketService = new SocketService();

export default socketService; 