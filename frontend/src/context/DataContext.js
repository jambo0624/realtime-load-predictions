import React, { createContext, useState, useEffect } from 'react';
import socketService from '../api/socketService';
import apiService from '../api/apiService';

// Create data context
export const DataContext = createContext();

/**
 * Data provider component for managing load prediction data
 */
export const DataProvider = ({ children }) => {
  // Data state
  const [cpuData, setCpuData] = useState({
    historical: [],
    predictions: [],
    isLoading: true,
    error: null
  });
  
  const [memoryData, setMemoryData] = useState({
    historical: [],
    predictions: [],
    isLoading: true,
    error: null
  });
  
  const [activeTarget, setActiveTarget] = useState('cpu');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notifications, setNotifications] = useState([]);

  // Initialize data and WebSocket connection
  useEffect(() => {
    // Load initial data
    loadInitialData();
    
    // Connect to WebSocket server
    socketService.connect();
    
    // Register WebSocket event handlers
    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    socketService.on('initialData', handleInitialData);
    socketService.on('dataUpdate', handleDataUpdate);
    socketService.on('notification', handleNotification);
    
    // Subscribe to both data targets
    setTimeout(() => {
      if (socketService.isConnected()) {
        socketService.subscribeToTarget('cpu');
        socketService.subscribeToTarget('memory');
      }
    }, 1000);
    
    // Cleanup function
    return () => {
      socketService.off('connect', handleConnect);
      socketService.off('disconnect', handleDisconnect);
      socketService.off('initialData', handleInitialData);
      socketService.off('dataUpdate', handleDataUpdate);
      socketService.off('notification', handleNotification);
      socketService.disconnect();
    };
  }, []);

  /**
   * Load initial data from API
   */
  const loadInitialData = async () => {
    try {
      // Set loading state
      setCpuData(prev => ({ ...prev, isLoading: true, error: null }));
      setMemoryData(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Load CPU data
      const cpuResponse = await apiService.getCombinedData('cpu', 100, 24);
      setCpuData({
        historical: cpuResponse.data.historical || [],
        predictions: cpuResponse.data.predictions || [],
        isLoading: false,
        error: null
      });
      
      // Load memory data
      const memoryResponse = await apiService.getCombinedData('memory', 100, 24);
      setMemoryData({
        historical: memoryResponse.data.historical || [],
        predictions: memoryResponse.data.predictions || [],
        isLoading: false,
        error: null
      });
    } catch (error) {
      console.error('Error loading initial data:', error);
      setCpuData(prev => ({ ...prev, isLoading: false, error: error.message }));
      setMemoryData(prev => ({ ...prev, isLoading: false, error: error.message }));
    }
  };

  /**
   * Handle WebSocket connect event
   */
  const handleConnect = () => {
    setConnectionStatus('connected');
    
    // Subscribe to data targets
    socketService.subscribeToTarget('cpu');
    socketService.subscribeToTarget('memory');
  };

  /**
   * Handle WebSocket disconnect event
   */
  const handleDisconnect = () => {
    setConnectionStatus('disconnected');
  };

  /**
   * Handle WebSocket initialData event
   * @param {Object} data - Initial data payload
   */
  const handleInitialData = (data) => {
    if (!data || !data.target) return;
    
    const { target, data: payload } = data;
    
    if (target === 'cpu') {
      setCpuData({
        historical: payload?.historical || [],
        predictions: payload?.predictions || [],
        isLoading: false,
        error: null
      });
    } else if (target === 'memory') {
      setMemoryData({
        historical: payload?.historical || [],
        predictions: payload?.predictions || [],
        isLoading: false,
        error: null
      });
    }
  };

  /**
   * Handle WebSocket dataUpdate event
   * @param {Object} data - Data update payload
   */
  const handleDataUpdate = (data) => {
    if (!data || !data.target) return;
    
    const { target, data: payload } = data;
    
    if (target === 'cpu') {
      setCpuData({
        historical: payload?.historical || [],
        predictions: payload?.predictions || [],
        isLoading: false,
        error: null
      });
    } else if (target === 'memory') {
      setMemoryData({
        historical: payload?.historical || [],
        predictions: payload?.predictions || [],
        isLoading: false,
        error: null
      });
    }
  };

  /**
   * Handle WebSocket notification event
   * @param {Object} notification - Notification payload
   */
  const handleNotification = (notification) => {
    setNotifications(prev => [notification, ...prev].slice(0, 10));
  };

  /**
   * Run a prediction with the specified data file
   * @param {string} dataFile - CSV data file name
   * @returns {Promise} - Promise with result
   */
  const runPrediction = async (dataFile) => {
    try {
      const result = await apiService.runPrediction(dataFile);
      return result;
    } catch (error) {
      console.error('Error running prediction:', error);
      throw error;
    }
  };

  /**
   * Import data from CSV files
   * @returns {Promise} - Promise with result
   */
  const importData = async () => {
    try {
      const result = await apiService.importData();
      return result;
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  };

  // Create context value
  const contextValue = {
    cpuData,
    memoryData,
    activeTarget,
    setActiveTarget,
    connectionStatus,
    notifications,
    runPrediction,
    importData,
    refreshData: loadInitialData
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}; 