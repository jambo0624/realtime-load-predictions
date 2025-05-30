import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api/data';

/**
 * API service for communicating with the backend
 */
class ApiService {
  /**
   * Get all users
   * @returns {Promise} - Promise with user list
   */
  async getUsers() {
    try {
      const response = await axios.get(`${API_URL}/users`);
      return response.data;
    } catch (error) {
      console.error('Error fetching users:', error);
      throw error;
    }
  }
  
  /**
   * Create a new user
   * @param {string} username - Username to create
   * @returns {Promise} - Promise with created user
   */
  async createUser(username) {
    try {
      const response = await axios.post(`${API_URL}/users`, { username });
      return response.data;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  }

  /**
   * Get historical data for a specific user
   * @param {number} limit - Number of records to retrieve
   * @param {string} username - Optional username to filter data
   * @returns {Promise} - Promise with data
   */
  async getHistoricalData(limit = 100, username = null) {
    try {
      const params = { limit };
      if (username) params.username = username;
      
      const response = await axios.get(`${API_URL}/all-combined`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }

  /**
   * Get both CPU and memory data combined
   * @param {number} historyLimit - Number of historical records
   * @param {number} predictionLimit - Number of prediction records
   * @param {string} username - Optional username to filter data
   * @returns {Promise} - Promise with both CPU and memory data
   */
  async getAllCombinedData(historyLimit = 100, predictionLimit = 24, username = null) {
    try {
      const params = { historyLimit, predictionLimit };
      if (username) params.username = username;
      
      const response = await axios.get(`${API_URL}/all-combined`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching all combined data:', error);
      throw error;
    }
  }

  /**
   * Run a prediction on a specific data file
   * @param {string} dataFile - Name of the data file
   * @returns {Promise} - Promise with result
   */
  async runPrediction(dataFile) {
    try {
      const response = await axios.post(`${API_URL}/predict`, { dataFile });
      return response.data;
    } catch (error) {
      console.error('Error running prediction:', error);
      throw error;
    }
  }

  /**
   * Import data from CSV files
   * @returns {Promise} - Promise with import results
   */
  async importData() {
    try {
      const response = await axios.post(`${API_URL}/import`);
      return response.data;
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }
  
  /**
   * Import a specific CSV file
   * @param {string} fileName - Name of the file to import
   * @returns {Promise} - Promise with import results
   */
  async importSpecificFile(fileName) {
    try {
      const response = await axios.post(`${API_URL}/import-file`, { fileName });
      return response.data;
    } catch (error) {
      console.error(`Error importing file ${fileName}:`, error);
      throw error;
    }
  }
}

const apiService = new ApiService()

export default apiService; 