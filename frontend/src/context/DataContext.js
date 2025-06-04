import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import dayjs from 'dayjs';
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
  // data window state
  const [dataWindow, setDataWindow] = useState({
    startTime: dayjs().subtract(1, 'hour').toDate(), // one hour ago
    endTime: dayjs().toDate()
  });
  
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
    // Update data window
    if (data.timestamp) {
      setDataWindow(prev => ({
        ...prev,
        endTime: dayjs(data.timestamp).toDate()
      }));
    }
    
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
    // Update data window - sliding time window
    if (data.timestamp) {
      setDataWindow(prev => {
        // Calculate time difference
        const newEndTime = dayjs(data.timestamp).toDate();
        const timeDiff = dayjs(newEndTime).diff(dayjs(prev.endTime));
        
        // sliding window
        return {
          startTime: timeDiff > 0 ? dayjs(prev.startTime).add(timeDiff, 'millisecond').toDate() : prev.startTime,
          endTime: newEndTime,
          windowStartTime: data.windowStartTime ? dayjs(data.windowStartTime).toDate() : prev.startTime
        };
      });
    }
    
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
   * Handle WebSocket dataEvent event
   * @param {Object} event - Event data
   */
  const handleDataEvent = useCallback((event) => {
    // Convert event to notification and add to notification list
    const notification = {
      type: event.event,
      data: event.data,
      timestamp: event.timestamp,
      message: getEventMessage(event)
    };
    
    setNotifications(prev => [notification, ...prev].slice(0, 10));
    
    // Handle specific event types
    switch (event.event) {
      case 'data_reset':
        // Data reset event - refresh data
        loadInitialData();
        break;
      case 'new_prediction':
        // New prediction event - refresh data
        loadInitialData();
        break;
      default:
        // Other event types
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Get notification message based on event type
   * @param {Object} event - Event object
   * @returns {string} - Notification message
   */
  const getEventMessage = (event) => {
    switch (event.event) {
      case 'data_reset':
        return `Data reset (${dayjs(event.timestamp).format('HH:mm:ss')})`;
      case 'new_prediction':
        return `New prediction generated (${dayjs(event.timestamp).format('HH:mm:ss')})`;
      default:
        return `${event.event} event (${dayjs(event.timestamp).format('HH:mm:ss')})`;
    }
  };

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
    socketService.on('dataEvent', handleDataEvent);
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
      socketService.off('dataEvent', handleDataEvent);
      socketService.off('notification', handleNotification);
      socketService.disconnect();
    };
  }, [handleConnect, handleDisconnect, handleInitialData, handleDataUpdate, handleDataEvent, handleNotification, currentUser]);
  
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
      // Always use 25 historical points and 60 prediction points
      const response = await apiService.getAllCombinedData(25, 60, currentUser.username);
      
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
   * Reset user data
   * @returns {Promise} - Promise result
   */
  const resetUserData = async () => {
    if (!currentUser) {
      throw new Error('No user selected');
    }
    
    try {
      // Call data reset API
      const response = await apiService.resetData(currentUser.username);
      
      // Refresh data
      if (response.status === 'success') {
        loadInitialData();
      }
      
      return response;
    } catch (error) {
      console.error('Error resetting user data:', error);
      throw error;
    }
  };

  /**
   * Run a prediction for the current user
   * @returns {Promise} - Promise with result
   */
  const runPrediction = async () => {
    if (!currentUser) {
      throw new Error('No user selected');
    }
    
    try {
      const result = await apiService.runPrediction(currentUser);
      
      // Refresh data after prediction
      loadInitialData();
      
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
    dataWindow,
    runPrediction,
    importData,
    importSpecificFile,
    refreshData: loadInitialData,
    resetUserData
  };

  return (
    <DataContext.Provider value={contextValue}>
      {children}
    </DataContext.Provider>
  );
}; 