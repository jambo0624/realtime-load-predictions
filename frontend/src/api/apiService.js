import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api/data';

/**
 * API service for communicating with the backend
 */
class ApiService {
  /**
   * Get historical data
   * @param {string} target - 'cpu' or 'memory'
   * @param {number} limit - Number of records to retrieve
   * @returns {Promise} - Promise with data
   */
  async getHistoricalData(target = 'cpu', limit = 100) {
    try {
      const response = await axios.get(`${API_URL}/historical`, {
        params: { target, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }

  /**
   * Get prediction data
   * @param {string} target - 'cpu' or 'memory'
   * @param {number} limit - Number of records to retrieve
   * @returns {Promise} - Promise with data
   */
  async getPredictions(target = 'cpu', limit = 24) {
    try {
      const response = await axios.get(`${API_URL}/predictions`, {
        params: { target, limit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching predictions:', error);
      throw error;
    }
  }

  /**
   * Get combined historical and prediction data
   * @param {string} target - 'cpu' or 'memory'
   * @param {number} historyLimit - Number of historical records
   * @param {number} predictionLimit - Number of prediction records
   * @returns {Promise} - Promise with data
   */
  async getCombinedData(target = 'cpu', historyLimit = 100, predictionLimit = 24) {
    try {
      const response = await axios.get(`${API_URL}/combined`, {
        params: { target, historyLimit, predictionLimit }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching combined data:', error);
      throw error;
    }
  }

  /**
   * Get both CPU and memory data combined
   * @param {number} historyLimit - Number of historical records
   * @param {number} predictionLimit - Number of prediction records
   * @returns {Promise} - Promise with both CPU and memory data
   */
  async getAllCombinedData(historyLimit = 100, predictionLimit = 24) {
    try {
      const response = await axios.get(`${API_URL}/all-combined`, {
        params: { historyLimit, predictionLimit }
      });
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
}

const apiService = new ApiService()

export default apiService; 