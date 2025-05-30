import React, { createContext, useState, useEffect } from 'react';
import apiService from '../api/apiService';

// Create user context
export const UserContext = createContext();

/**
 * User provider component for managing user selection
 */
export const UserProvider = ({ children }) => {
  // User state
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load users on component mount
  useEffect(() => {
    loadUsers();
  }, []);

  /**
   * Load users from API
   */
  const loadUsers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await apiService.getUsers();
      const userList = response.data || [];
      setUsers(userList);
      
      // Check if we have a saved user in localStorage
      const savedUsername = localStorage.getItem('currentUsername');
      
      if (savedUsername && userList.length > 0) {
        // Try to find the saved user
        const savedUser = userList.find(user => user.username === savedUsername);
        if (savedUser) {
          setCurrentUser(savedUser);
        } else {
          // If saved user not found, use first user
          setCurrentUser(userList[0]);
          localStorage.setItem('currentUsername', userList[0].username);
        }
      } else if (userList.length > 0) {
        // No saved user, use first user
        setCurrentUser(userList[0]);
        localStorage.setItem('currentUsername', userList[0].username);
      } else {
        // No users available
        console.warn('No users available in the system');
        setCurrentUser(null);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading users:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  /**
   * Select a user
   * @param {Object} user - User to select
   */
  const selectUser = (user) => {
    setCurrentUser(user);
    localStorage.setItem('currentUsername', user.username);
  };

  // Create context value
  const contextValue = {
    users,
    currentUser,
    isLoading,
    error,
    loadUsers,
    selectUser
  };

  return (
    <UserContext.Provider value={contextValue}>
      {children}
    </UserContext.Provider>
  );
}; 