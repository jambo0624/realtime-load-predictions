import React, { createContext, useState, useContext } from 'react';

// Create notification context
export const NotificationContext = createContext();

/**
 * Notification provider component for managing notifications
 */
export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  
  /**
   * Show a success notification
   * @param {string} message - Notification message
   */
  const showSuccess = (message) => {
    const notification = {
      id: Date.now(),
      type: 'success',
      message,
    };
    setNotifications(prev => [...prev, notification]);
    setTimeout(() => {
      removeNotification(notification.id);
    }, 5000);
  };
  
  /**
   * Show an error notification
   * @param {string} message - Notification message
   */
  const showError = (message) => {
    const notification = {
      id: Date.now(),
      type: 'error',
      message,
    };
    setNotifications(prev => [...prev, notification]);
    setTimeout(() => {
      removeNotification(notification.id);
    }, 5000);
  };
  
  /**
   * Remove a notification by ID
   * @param {number} id - Notification ID
   */
  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };
  
  // Create context value
  const contextValue = {
    notifications,
    showSuccess,
    showError,
    removeNotification
  };
  
  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

/**
 * Custom hook for accessing the NotificationContext
 * @returns {Object} - NotificationContext value
 */
export const useNotification = () => {
  const context = useContext(NotificationContext);
  
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  
  return context;
}; 