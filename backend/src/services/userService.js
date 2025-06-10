const logger = require('../utils/logger');
const db = require('../utils/db');

class UserService {
  /**
   * Get user by username
   * @param {string} username - Username
   * @returns {Promise<Object>} - User object
   */
  async getUserByUsername(username) {
    try {
      const { rows } = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      
      return rows[0] || null;
    } catch (error) {
      logger.error('Error fetching user by username:', error);
      throw error;
    }
  }
  
  /**
   * Get user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object>} - User object
   */
  async getUserById(id) {
    try {
      const { rows } = await db.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
      );
      
      return rows[0] || null;
    } catch (error) {
      logger.error('Error fetching user by ID:', error);
      throw error;
    }
  }
  
  /**
   * Create a new user
   * @param {string} username - Username
   * @returns {Promise<Object>} - Created user object
   */
  async createUser(username) {
    try {
      // Check if user already exists
      const existingUser = await this.getUserByUsername(username);
      if (existingUser) {
        return existingUser;
      }
      
      // Create new user
      const { rows } = await db.query(
        'INSERT INTO users (username) VALUES ($1) RETURNING *',
        [username]
      );
      
      logger.info(`Created new user: ${username}`);
      return rows[0];
    } catch (error) {
      logger.error('Error creating user:', error);
      throw error;
    }
  }
  
  /**
   * Get or create a user by username
   * @param {string} username - Username
   * @returns {Promise<Object>} - User object
   */
  async getOrCreateUser(username) {
    try {
      let user = await this.getUserByUsername(username);
      
      if (!user) {
        user = await this.createUser(username);
      }
      
      return user;
    } catch (error) {
      logger.error('Error getting or creating user:', error);
      throw error;
    }
  }

  /**
   * Get all users
   * @returns {Promise<Array>} - Array of user objects
   */
  async getAllUsers() {
    try {
      const { rows } = await db.query('SELECT * FROM users');
      return rows;
    } catch (error) {
      logger.error('Error fetching all users:', error);
      throw error;
    }
  }
  
  /**
   * Get default system user
   * @returns {Promise<Object>} - Default user object
   */
  async getDefaultUser() {
    return this.getOrCreateUser('system');
  }
}

module.exports = new UserService(); 