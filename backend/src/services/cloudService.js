const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const dayjs = require('dayjs');
const logger = require('../utils/logger');
const db = require('../utils/db');

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
    } catch (error) {
      logger.error('Failed to initialize default AWS client:', error);
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
      
      // Initialize clients for this region
      await this._initializeAwsClient(null, region);
      
      // Apply strategy
      let result = await this._applyAwsStrategy(strategy, resources, thresholds);
      
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
          // Configure predictive scaling
          const predictiveASGName = 'app-predictive-scaling-group';
          
          // Create a predictive scaling policy
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
            logger.info(`Configured predictive scaling for group: ${predictiveASGName}`);
          } catch (err) {
            logger.warn(`Predictive scaling configuration failed: ${err.message}`);
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
              maxInstances: thresholds?.maxInstances || 10
            }
          };
          
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