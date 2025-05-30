import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import socketService from '../api/socketService';
import apiService from '../api/apiService';
import { UserContext } from './UserContext';

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
  
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notifications, setNotifications] = useState([]);
  
  // Get current user from UserContext
  const { currentUser, users, loadUsers, selectUser } = useContext(UserContext);

  /**
   * Handle WebSocket connect event
   */
  const handleConnect = useCallback(() => {
    setConnectionStatus('connected');
    
    // Subscribe to data updates with current username
    if (currentUser) {
      socketService.subscribeToData(currentUser.username);
    }
  }, [currentUser]);

  /**
   * Handle WebSocket disconnect event
   */
  const handleDisconnect = useCallback(() => {
    setConnectionStatus('disconnected');
  }, []);

  /**
   * Handle WebSocket initialData event
   * @param {Object} data - Initial data payload with CPU and memory data
   */
  const handleInitialData = useCallback((data) => {
    // Update CPU data
    setCpuData({
      historical: data.cpu?.historical || [],
      predictions: data.cpu?.predictions || [],
      isLoading: false,
      error: null
    });
    
    // Update memory data
    setMemoryData({
      historical: data.memory?.historical || [],
      predictions: data.memory?.predictions || [],
      isLoading: false,
      error: null
    });
  }, []);

  /**
   * Handle WebSocket dataUpdate event
   * @param {Object} data - Data update payload with CPU and memory data
   */
  const handleDataUpdate = useCallback((data) => {
    // Update CPU data
    setCpuData({
      historical: data.cpu?.historical || [],
      predictions: data.cpu?.predictions || [],
      isLoading: false,
      error: null
    });
    
    // Update memory data
    setMemoryData({
      historical: data.memory?.historical || [],
      predictions: data.memory?.predictions || [],
      isLoading: false,
      error: null
    });
  }, []);

  /**
   * Handle WebSocket notification event
   * @param {Object} notification - Notification payload
   */
  const handleNotification = useCallback((notification) => {
    setNotifications(prev => [notification, ...prev].slice(0, 10));
  }, []);

  // Initialize data and WebSocket connection
  useEffect(() => {
    // Connect to WebSocket server
    socketService.connect();
    
    // Register WebSocket event handlers
    socketService.on('connect', handleConnect);
    socketService.on('disconnect', handleDisconnect);
    socketService.on('initialData', handleInitialData);
    socketService.on('dataUpdate', handleDataUpdate);
    socketService.on('notification', handleNotification);
    
    // Subscribe to data updates
    setTimeout(() => {
      if (socketService.isConnected() && currentUser) {
        socketService.subscribeToData(currentUser.username);
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
  }, [handleConnect, handleDisconnect, handleInitialData, handleDataUpdate, handleNotification, currentUser]);
  
  // Load data when current user changes
  useEffect(() => {
    if (currentUser) {
      loadInitialData();
      
      // Resubscribe to data updates with new username
      if (socketService.isConnected()) {
        socketService.subscribeToData(currentUser.username);
      }
    } else {
      // If there is no current user, clear the data state
      setCpuData({
        historical: [],
        predictions: [],
        isLoading: false,
        error: 'Please select a user to view data'
      });
      
      setMemoryData({
        historical: [],
        predictions: [],
        isLoading: false,
        error: 'Please select a user to view data'
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  /**
   * Load initial data from API
   */
  const loadInitialData = async () => {
    if (!currentUser) {
      // If there is no current user, clear the data state
      setCpuData({
        historical: [],
        predictions: [],
        isLoading: false,
        error: 'Please select a user to view data'
      });
      
      setMemoryData({
        historical: [],
        predictions: [],
        isLoading: false,
        error: 'Please select a user to view data'
      });
      return;
    }
    
    try {
      // Set loading state
      setCpuData(prev => ({ ...prev, isLoading: true, error: null }));
      setMemoryData(prev => ({ ...prev, isLoading: true, error: null }));
      
      // Load both CPU and memory data in one request
      const response = await apiService.getAllCombinedData(100, 24, currentUser.username);
      
      // Update CPU data
      setCpuData({
        historical: response.data.cpu.historical || [],
        predictions: response.data.cpu.predictions || [],
        isLoading: false,
        error: null
      });
      
      // Update memory data
      setMemoryData({
        historical: response.data.memory.historical || [],
        predictions: response.data.memory.predictions || [],
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
      
      // Refresh data after import
      if (result.status === 'success') {
        // Check if user needs to be selected
        checkAndSelectUser();
      }
      return result;
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  };

  /**
   * Import a specific CSV file
   * @param {string} fileName - Name of the file to import
   * @returns {Promise} - Promise with result
   */
  const importSpecificFile = async (fileName) => {
    try {
      const result = await apiService.importSpecificFile(fileName);
      
      // Refresh data after import
      if (result.status === 'success') {
        // Check if user needs to be selected
        checkAndSelectUser();
      }
      return result;
    } catch (error) {
      console.error(`Error importing file ${fileName}:`, error);
      throw error;
    }
  };

  /**
   * Check if a user needs to be selected and select the first one if available
   */
  const checkAndSelectUser = async () => {
    try {
      // Reload users to get the latest list after import
      await loadUsers();
      
      // After reloading users, check if we need to select one
      if (!currentUser && users.length > 0) {
        // Select the first user
        selectUser(users[0]);
        console.log(`Auto-selected user: ${users[0].username}`);
        
        // loadInitialData will be called by the useEffect that watches currentUser
      } else if (currentUser) {
        // If a user is already selected, refresh the data
        loadInitialData();
      }
    } catch (error) {
      console.error('Error checking and selecting user:', error);
    }
  };

  // Create context value
  const contextValue = {
    cpuData,
    memoryData,
    connectionStatus,
    notifications,
    runPrediction,
    importData,
    importSpecificFile,
    refreshData: loadInitialData
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}; 