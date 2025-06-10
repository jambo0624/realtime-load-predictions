const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const dayjs = require('dayjs');
const logger = require('../utils/logger');
const db = require('../utils/db');
const predictionService = require('./predictionService');
const userService = require('./userService');
const dataService = require('./dataService');

// Try to use dotenv for local development if needed
try {
  require('dotenv').config();
} catch (err) {
  // Ignore if dotenv is not installed
}

// Get AWS configuration from environment variables
const AWS_CONFIG = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT || 'http://localhost:4566'
};

// AWS SDK v3
let awsServices = {};
try {
  // Import AWS credential provider
  awsServices.credentials = require('@aws-sdk/credential-provider-node');
  
  // Import AWS service clients
  awsServices.AutoScalingClient = require('@aws-sdk/client-auto-scaling').AutoScalingClient;
  
  // Import STS client for assuming role
  awsServices.STSClient = require('@aws-sdk/client-sts').STSClient;
  
  // Import AWS commands
  awsServices.autoScalingCommands = require('@aws-sdk/client-auto-scaling');
  
  logger.info('AWS SDK v3 initialized successfully');
} catch (err) {
  logger.warn('AWS SDK v3 not installed. AWS provider functionality will be limited.');
  logger.debug(err.message);
}

/**
 * Cloud service for managing AWS cloud resources
 */
class CloudService {
  constructor() {
    // Initialize local storage
    this.tempCredentialsDir = path.join(__dirname, '../../data/temp_credentials');
    
    // Create temp credentials directory if it doesn't exist
    if (!fs.existsSync(this.tempCredentialsDir)) {
      fs.mkdirSync(this.tempCredentialsDir, { recursive: true });
    }
    
    // Initialize AWS clients cache
    this.awsClients = {};
    
    // Store active prediction polling jobs (userId -> intervalId)
    this.predictionPollingJobs = {};
    
    // Track active strategies per user
    this.userStrategies = {};
    
    // Initialize on startup to speed up later requests
    this.initializeDefaultClient();
  }
  
  /**
   * Initialize the default AWS client using environment variables on startup
   */
  async initializeDefaultClient() {
    try {
      const region = AWS_CONFIG.region;
      await this._initializeAwsClient(null, region);
      logger.info(`Default AWS client initialized for region ${region}`);
      
      // After successful initialization, automatically import data and run predictions
      this._autoImportAndPredict()
        .then(() => logger.info('Auto import and prediction completed'))
        .catch(err => logger.error('Error in auto import and prediction:', err));
        
    } catch (error) {
      logger.error('Failed to initialize default AWS client:', error);
    }
  }
  
  /**
   * Automatically import data and run predictions
   * @private
   */
  async _autoImportAndPredict() {
    try {
      logger.info('Starting automatic data import and prediction process...');
      
      // 1. Import data
      logger.info('Step 1: Importing data files...');
      const importResult = await dataService.importAllFiles();
      
      if (importResult.status !== 'success') {
        logger.warn(`Data import was not fully successful: ${importResult.message}`);
      } else {
        logger.info(`Successfully imported ${importResult.imported} files from ${importResult.files.length} total files`);
      }
      
      // 2. Run predictions for all users
      logger.info('Step 2: Running predictions for all users...');
      const predictionResult = await dataService.runPredictionsForAllUsers();
      
      if (predictionResult.status !== 'success') {
        logger.warn(`Prediction process was not fully successful: ${predictionResult.message}`);
      } else {
        logger.info(`Successfully ran predictions for ${predictionResult.results.length} users`);
      }
      
      logger.info('Automatic data import and prediction process completed');
    } catch (error) {
      logger.error('Error in automatic data import and prediction process:', error);
      throw error;
    }
  }
  
  /**
   * Apply resource scaling strategy
   * @param {string} strategy - Scaling strategy (auto, manual, predictive)
   * @param {Object} resources - Resource requirements
   * @param {Object} thresholds - Scaling thresholds
   * @param {string} region - AWS region to use
   * @returns {Promise<Object>} - Result
   */
  async applyResourceStrategy(strategy, resources, thresholds, region) {
    try {
      logger.info(`Applying ${strategy} scaling strategy in region ${region}`);
      
      // Get user ID for tracking polling jobs
      const userId = thresholds?.userId;
      
      // If changing from predictive to another strategy, stop any existing polling
      if (strategy !== 'predictive' && userId && this.predictionPollingJobs[userId]) {
        this._stopPredictivePolling(userId);
      }
      
      // Initialize clients for this region
      await this._initializeAwsClient(null, region);
      
      // Apply strategy
      let result = await this._applyAwsStrategy(strategy, resources, thresholds);
      
      // If predictive strategy and has userId, start polling
      if (strategy === 'predictive' && userId) {
        // Start or restart polling job
        this._startPredictivePolling(userId, resources, thresholds, region);
      }
      
      // Store the current strategy for this user
      if (userId) {
        this.userStrategies[userId] = {
          strategy,
          resources,
          thresholds,
          region,
          timestamp: dayjs().toDate(),
          result: { ...result }
        };
        
        logger.info(`Stored ${strategy} strategy settings for user ${userId}`);
      }
      
      return {
        ...result,
        strategy,
        applied: dayjs().toDate()
      };
    } catch (error) {
      logger.error(`Error applying AWS strategy:`, error);
      throw new Error(`Failed to apply AWS strategy: ${error.message}`);
    }
  }
  
  /**
   * Get current resource strategy for a user
   * @param {number} userId - User ID
   * @returns {Object|null} - Current strategy or null if not found
   */
  getCurrentStrategy(userId) {
    if (!userId || !this.userStrategies[userId]) {
      return null;
    }
    
    return {
      ...this.userStrategies[userId],
      isPollingActive: !!this.predictionPollingJobs[userId]
    };
  }
  
  /**
   * Start predictive polling for a user
   * @param {number} userId - User ID
   * @param {Object} resources - Resource configuration
   * @param {Object} thresholds - Threshold configuration
   * @param {string} region - AWS region
   * @private
   */
  _startPredictivePolling(userId, resources, thresholds, region) {
    // Stop any existing polling job for this user
    this._stopPredictivePolling(userId);
    
    logger.info(`Starting predictive scaling polling for user ${userId} in region ${region}`);
    
    // Create polling job (every 15 minutes)
    const pollingInterval = 15 * 60 * 1000;
    
    this.predictionPollingJobs[userId] = setInterval(async () => {
      try {
        logger.info(`Running scheduled predictive scaling update for user ${userId}`);
        
        // Reinitialize client if needed
        await this._initializeAwsClient(null, region);
        
        // Apply predictive strategy
        await this._applyAwsStrategy('predictive', resources, thresholds);
        
        logger.info(`Completed scheduled predictive scaling update for user ${userId}`);
      } catch (error) {
        logger.error(`Error in predictive scaling polling for user ${userId}:`, error);
      }
    }, pollingInterval);
    
    logger.info(`Predictive scaling polling started for user ${userId}, interval: ${pollingInterval}ms`);
  }
  
  /**
   * Stop predictive polling for a user
   * @param {number} userId - User ID
   * @private
   */
  _stopPredictivePolling(userId) {
    if (this.predictionPollingJobs[userId]) {
      logger.info(`Stopping predictive scaling polling for user ${userId}`);
      clearInterval(this.predictionPollingJobs[userId]);
      delete this.predictionPollingJobs[userId];
    }
  }
  
  /**
   * Stop all prediction polling jobs
   * This should be called when shutting down the server
   */
  stopAllPollingJobs() {
    logger.info(`Stopping all predictive scaling polling jobs: ${Object.keys(this.predictionPollingJobs).length} active jobs`);
    
    for (const userId in this.predictionPollingJobs) {
      this._stopPredictivePolling(userId);
    }
    
    logger.info('All predictive scaling polling jobs stopped');
  }
  
  // Private methods
  
  /**
   * Initialize AWS client using environment variables
   * @param {string} clientId - Optional client ID for caching
   * @param {string} region - AWS region to use
   * @returns {Promise<void>}
   * @private
   */
  async _initializeAwsClient(clientId, region) {
    const clientKey = clientId ? `${clientId}-${region}` : `default-${region}`;
    
    // Check if we already have a client for this region
    if (this.awsClients[clientKey]) {
      logger.debug(`Using cached AWS client for region ${region}`);
      return;
    }
    
    try {
      if (!awsServices.STSClient) {
        throw new Error('AWS SDK v3 not installed or STS client not available');
      }
      
      // Base client configuration with endpoint override for LocalStack
      const clientConfig = {
        region: region || AWS_CONFIG.region,
        credentials: {
          accessKeyId: AWS_CONFIG.accessKeyId,
          secretAccessKey: AWS_CONFIG.secretAccessKey
        }
      };
      
      // Add endpoint if using LocalStack
      if (AWS_CONFIG.endpoint && !AWS_CONFIG.endpoint.includes('amazonaws.com')) {
        clientConfig.endpoint = AWS_CONFIG.endpoint;
        logger.info(`Using LocalStack endpoint: ${AWS_CONFIG.endpoint}`);
      }
      
      // Initialize AWS clients
      this.awsClients[clientKey] = {
        autoscaling: new awsServices.AutoScalingClient(clientConfig),
        autoScalingCommands: awsServices.autoScalingCommands,
        region
      };
      
      // Test the connection immediately to verify it's working
      try {
        logger.info(`Testing AWS AutoScaling client connection for region ${region}...`);
        const testCommand = new awsServices.autoScalingCommands.DescribeAutoScalingGroupsCommand({
          MaxRecords: 1
        });
        await this.awsClients[clientKey].autoscaling.send(testCommand);
        logger.info(`AWS client connection test successful for region ${region}`);
      } catch (connectionError) {
        logger.error(`AWS connection test failed - Full error:`, JSON.stringify(connectionError, null, 2));
        logger.error(`Error name: ${connectionError.name}, code: ${connectionError.code || 'N/A'}`);
        
        const errorMessage = connectionError.message 
          ? connectionError.message 
          : (connectionError.toString ? connectionError.toString() : 'Unknown error');
          
        throw new Error(`AWS connection failed: ${errorMessage}. Is LocalStack running correctly with proper authentication?`);
      }
      
      logger.info(`AWS clients initialized for region ${region}`);
    } catch (error) {
      logger.error(`Error initializing AWS client: ${error.message}`);
      throw new Error(`Failed to initialize AWS client: ${error.message}`);
    }
  }
  
  /**
   * Apply AWS scaling strategy
   * @param {string} strategy - Scaling strategy
   * @param {Object} resources - Resource requirements
   * @param {Object} thresholds - Scaling thresholds
   * @returns {Promise<Object>} - Result
   * @private
   */
  async _applyAwsStrategy(strategy, resources, thresholds) {
    if (!this.awsClients) {
      return this._mockCloudResponse('aws', strategy);
    }
    
    try {
      // Get the first available client
      const clientKey = Object.keys(this.awsClients)[0];
      if (!clientKey) {
        throw new Error('No AWS client available');
      }
      
      const client = this.awsClients[clientKey];
      const timestamp = dayjs().toDate();
      
      switch (strategy) {
        case 'auto':
          // Configure AWS Auto Scaling
          const autoScalingGroupName = 'app-auto-scaling-group';
          
          // Check if auto scaling group exists
          const describeASGCommand = new client.autoScalingCommands.DescribeAutoScalingGroupsCommand({
            AutoScalingGroupNames: [autoScalingGroupName]
          });
          
          let asgExists = false;
          try {
            const describeResult = await client.autoscaling.send(describeASGCommand);
            asgExists = describeResult.AutoScalingGroups && describeResult.AutoScalingGroups.length > 0;
          } catch (err) {
            logger.warn(`Auto scaling group check failed: ${err.message}`);
          }
          
          if (asgExists) {
            // Update existing auto scaling group
            const updateCommand = new client.autoScalingCommands.UpdateAutoScalingGroupCommand({
              AutoScalingGroupName: autoScalingGroupName,
              MinSize: thresholds?.minInstances || 1,
              MaxSize: thresholds?.maxInstances || 5,
              DesiredCapacity: thresholds?.desiredInstances || 2
            });
            
            await client.autoscaling.send(updateCommand);
            logger.info(`Updated auto scaling group: ${autoScalingGroupName}`);
          }
          
          // Configure scaling policies based on CPU utilization
          const policyName = 'cpu-target-tracking-policy';
          const putScalingPolicyCommand = new client.autoScalingCommands.PutScalingPolicyCommand({
            AutoScalingGroupName: autoScalingGroupName,
            PolicyName: policyName,
            PolicyType: 'TargetTrackingScaling',
            TargetTrackingConfiguration: {
              PredefinedMetricSpecification: {
                PredefinedMetricType: 'ASGAverageCPUUtilization'
              },
              TargetValue: thresholds?.cpuThreshold || 70
            },
            EstimatedInstanceWarmup: 300
          });
          
          await client.autoscaling.send(putScalingPolicyCommand);
          logger.info(`Configured auto scaling policy: ${policyName}`);
          
          return {
            provider: 'aws',
            strategy: 'auto',
            configured: true,
            timestamp,
            details: {
              cpuThreshold: thresholds?.cpuThreshold || 70,
              memoryThreshold: thresholds?.memoryThreshold || 70,
              minInstances: thresholds?.minInstances || 1,
              maxInstances: thresholds?.maxInstances || 5
            }
          };
          
        case 'manual':
          // Set fixed instance size/count
          const manualASGName = 'app-manual-scaling-group';
          
          // Update or create the auto scaling group with fixed capacity
          try {
            const updateManualCommand = new client.autoScalingCommands.UpdateAutoScalingGroupCommand({
              AutoScalingGroupName: manualASGName,
              MinSize: resources?.instances || 2,
              MaxSize: resources?.instances || 2,
              DesiredCapacity: resources?.instances || 2
            });
            
            await client.autoscaling.send(updateManualCommand);
            logger.info(`Set manual scaling for group: ${manualASGName}`);
          } catch (err) {
            logger.warn(`Manual scaling update failed: ${err.message}`);
          }
          
          return {
            provider: 'aws',
            strategy: 'manual',
            configured: true,
            timestamp,
            details: {
              cpu: resources?.cpu || 2,
              memory: resources?.memory || 4,
              instances: resources?.instances || 2
            }
          };
          
        case 'predictive':
          // Use ML predictions to determine required resources
          const predictiveASGName = 'app-predictive-scaling-group';
          
          // Get user ID from thresholds (frontend should pass this)
          const userId = thresholds?.userId;
          
          if (!userId) {
            logger.warn('No user ID provided for predictive scaling. Using default settings.');
            return {
              provider: 'aws',
              strategy: 'predictive',
              configured: true,
              timestamp,
              details: {
                cpuBuffer: thresholds?.cpuBuffer || 20,
                memoryBuffer: thresholds?.memoryBuffer || 20,
                minInstances: thresholds?.minInstances || 1,
                maxInstances: thresholds?.maxInstances || 10,
                message: 'Used default settings (no user ID provided)'
              }
            };
          }
          
          try {
            // Get CPU predictions for the next 4 hours (80 predictions with 3-minute intervals)
            logger.info(`Fetching ML predictions for user ${userId} to apply predictive scaling`);
            const cpuPredictions = await predictionService.getLatestPredictions('cpu', 80, userId);
            
            if (!cpuPredictions || cpuPredictions.length === 0) {
              logger.warn(`No predictions found for user ${userId}. Using default settings.`);
              return {
                provider: 'aws',
                strategy: 'predictive',
                configured: true,
                timestamp,
                details: {
                  cpuBuffer: thresholds?.cpuBuffer || 20,
                  memoryBuffer: thresholds?.memoryBuffer || 20,
                  minInstances: thresholds?.minInstances || 1,
                  maxInstances: thresholds?.maxInstances || 10,
                  message: 'Used default settings (no predictions found)'
                }
              };
            }
            
            // Calculate resources required based on CPU predictions
            const cpuValues = cpuPredictions.map(p => parseFloat(p.average_usage_cpu));
            const maxCpuPredicted = Math.max(...cpuValues);
            const avgCpuPredicted = cpuValues.reduce((sum, val) => sum + val, 0) / cpuValues.length;
            
            logger.info(`ML predictions analysis: Max CPU: ${maxCpuPredicted.toFixed(2)}%, Avg CPU: ${avgCpuPredicted.toFixed(2)}%`);
            
            // Calculate required instances based on CPU predictions
            // Apply buffer for safety margin
            const cpuBuffer = thresholds?.cpuBuffer || 20; // Default 20% buffer
            const cpuThresholdPerInstance = thresholds?.cpuThresholdPerInstance || 70; // Target CPU per instance
            
            // Calculate instances needed for the peak load with buffer
            const peakCpuWithBuffer = maxCpuPredicted * (1 + cpuBuffer / 100);
            const recommendedInstances = Math.ceil(peakCpuWithBuffer / cpuThresholdPerInstance);
            
            // Ensure within min/max bounds
            const minInstances = thresholds?.minInstances || 1;
            const maxInstances = thresholds?.maxInstances || 10;
            const scaledInstances = Math.min(Math.max(recommendedInstances, minInstances), maxInstances);
            
            logger.info(`Predictive scaling calculation: Peak CPU with ${cpuBuffer}% buffer: ${peakCpuWithBuffer.toFixed(2)}%`);
            logger.info(`Recommended instances: ${recommendedInstances}, Scaled to: ${scaledInstances} (min: ${minInstances}, max: ${maxInstances})`);
            
            // Apply the calculated scaling to the auto scaling group
            try {
              const updateCommand = new client.autoScalingCommands.UpdateAutoScalingGroupCommand({
                AutoScalingGroupName: predictiveASGName,
                MinSize: scaledInstances,
                MaxSize: scaledInstances + 2, // Allow some room for unexpected spikes
                DesiredCapacity: scaledInstances
              });
              
              await client.autoscaling.send(updateCommand);
              logger.info(`Applied predictive scaling to group: ${predictiveASGName} with ${scaledInstances} instances`);
            } catch (err) {
              logger.warn(`Predictive scaling application failed: ${err.message}`);
            }
            
            return {
              provider: 'aws',
              strategy: 'predictive',
              configured: true,
              timestamp,
              details: {
                cpuBuffer: cpuBuffer,
                predictedMaxCpu: maxCpuPredicted,
                predictedAvgCpu: avgCpuPredicted,
                minInstances: minInstances,
                maxInstances: maxInstances,
                recommendedInstances: recommendedInstances,
                appliedInstances: scaledInstances,
                predictionCount: cpuPredictions.length,
                predictionTimeRange: {
                  start: cpuPredictions[0].time_dt,
                  end: cpuPredictions[cpuPredictions.length - 1].time_dt
                },
                pollingEnabled: true,
                pollingInterval: '15 minutes'
              }
            };
          } catch (err) {
            logger.error(`Error applying ML-based predictive scaling: ${err.message}`, err);
            
            // Fallback to AWS native predictive scaling if ML predictions fail
            try {
              const predictivePolicyCommand = new client.autoScalingCommands.PutScalingPolicyCommand({
                AutoScalingGroupName: predictiveASGName,
                PolicyName: 'cpu-predictive-scaling-policy',
                PolicyType: 'PredictiveScaling',
                PredictiveScalingConfiguration: {
                  MetricSpecifications: [
                    {
                      TargetValue: thresholds?.cpuTarget || 70,
                      PredefinedMetricPairSpecification: {
                        PredefinedMetricType: 'ASGCPUUtilization'
                      }
                    }
                  ],
                  Mode: 'ForecastAndScale'
                }
              });
              
              await client.autoscaling.send(predictivePolicyCommand);
              logger.info(`Fell back to AWS native predictive scaling for group: ${predictiveASGName}`);
            } catch (fallbackErr) {
              logger.warn(`AWS native predictive scaling fallback failed: ${fallbackErr.message}`);
            }
            
            return {
              provider: 'aws',
              strategy: 'predictive',
              configured: true,
              timestamp,
              details: {
                cpuBuffer: thresholds?.cpuBuffer || 20,
                memoryBuffer: thresholds?.memoryBuffer || 20,
                minInstances: thresholds?.minInstances || 1,
                maxInstances: thresholds?.maxInstances || 10,
                error: err.message,
                message: 'Used fallback settings due to prediction error'
              }
            };
          }
          
        default:
          throw new Error(`Unknown AWS strategy: ${strategy}`);
      }
    } catch (error) {
      logger.error('Error applying AWS strategy:', error);
      throw error;
    }
  }
  
  /**
   * Create mock response for cloud operations
   * @param {string} provider - Cloud provider
   * @param {string} operation - Operation type
   * @returns {Object} - Mock response
   * @private
   */
  _mockCloudResponse(provider, operation) {
    const timestamp = dayjs().toDate();
    
    switch (operation) {
      case 'auto':
        return {
          provider,
          strategy: 'auto',
          configured: true,
          timestamp,
          details: {
            cpuThreshold: 70,
            memoryThreshold: 70,
            minInstances: 1,
            maxInstances: 5
          }
        };
        
      case 'manual':
        return {
          provider,
          strategy: 'manual',
          configured: true,
          timestamp,
          details: {
            cpu: 2,
            memory: 4,
            instances: 3
          }
        };
        
      case 'predictive':
        return {
          provider,
          strategy: 'predictive',
          configured: true,
          timestamp,
          details: {
            cpuBuffer: 20,
            memoryBuffer: 20,
            minInstances: 1,
            maxInstances: 10
          }
        };
        
      default:
        return {
          provider,
          operation,
          status: 'mock',
          message: 'This is a mock response. In a real implementation, this would call actual cloud provider APIs.',
          timestamp
        };
    }
  }
}

module.exports = new CloudService(); 