/**
 * String utility functions for the application
 */

/**
 * Clean and format a username for display
 * Keeps only alphanumeric characters and limits length
 * 
 * @param {string} username - The original username
 * @param {number} maxLength - Maximum length of the result (default: 7)
 * @returns {string} - Cleaned username
 */
export const formatUsername = (username) => {
  if (!username) return 'user';

  // Define set of valid characters (letters and numbers)
  const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  
  // Filter out invalid characters
  const cleanChars = username
    .split('')
    .filter(char => validChars.includes(char))
    .join('');
  
  // Take first 7 valid characters
  const shortId = cleanChars.slice(0, 7);
  
  // Return shortened ID or "user" if empty
  return shortId || 'user';
};

/**
 * Format a username for display in dropdown
 * If username is longer than maxLength, it will be truncated and ellipsis added
 * 
 * @param {string} username - The original username
 * @param {number} maxLength - Maximum display length before truncation (default: 15)
 * @returns {string} - Formatted username for display
 */
export const formatUsernameForDisplay = (username, maxLength = 7) => {
  if (!username) return 'user';
  
  if (username.length <= maxLength) {
    return username;
  }
  
  return `${username.slice(0, maxLength)}...`;
}; 