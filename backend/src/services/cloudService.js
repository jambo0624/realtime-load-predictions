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

// AWS SDK v3
let awsServices = {};
try {
  // Import AWS SDK v3 core modules
  awsServices.config = require('@aws-sdk/config-resolver');
  awsServices.credentials = require('@aws-sdk/credential-provider-node');
  
  // Import AWS service clients
  awsServices.EC2Client = require('@aws-sdk/client-ec2').EC2Client;
  awsServices.EKSClient = require('@aws-sdk/client-eks').EKSClient;
  awsServices.AutoScalingClient = require('@aws-sdk/client-auto-scaling').AutoScalingClient;
  
  // Import STS client for assuming role
  awsServices.STSClient = require('@aws-sdk/client-sts').STSClient;
  awsServices.AssumeRoleCommand = require('@aws-sdk/client-sts').AssumeRoleCommand;
  
  // Import AWS commands
  awsServices.ec2Commands = require('@aws-sdk/client-ec2');
  awsServices.eksCommands = require('@aws-sdk/client-eks');
  awsServices.autoScalingCommands = require('@aws-sdk/client-auto-scaling');
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
    
    // Cache for temporary credentials
    this.temporaryCredentials = {};
  }
  
  /**
   * Save AWS account with IAM role
   * @param {number} userId - User ID
   * @param {string} accountId - AWS account ID
   * @param {string} roleArn - IAM role ARN
   * @param {string} externalId - External ID for cross-account role (optional)
   * @param {string[]} regions - AWS regions to monitor
   * @returns {Promise<Object>} - Result
   */
  async saveAwsAccount(userId, accountId, roleArn, externalId, regions) {
    try {
      // Validate AWS account ID format (12 digits)
      if (!/^\d{12}$/.test(accountId)) {
        throw new Error('Invalid AWS account ID format. Must be 12 digits.');
      }
      
      // Validate IAM role ARN format
      if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(roleArn)) {
        throw new Error('Invalid IAM role ARN format.');
      }
      
      // Validate regions
      if (!Array.isArray(regions) || regions.length === 0) {
        throw new Error('At least one AWS region must be specified.');
      }
      
      // Validate all regions are in the correct format
      const validRegionPattern = /^[a-z]{2}-[a-z]+-\d$/;
      for (const region of regions) {
        if (!validRegionPattern.test(region)) {
          throw new Error(`Invalid AWS region format: ${region}`);
        }
      }
      
      // Check if user already has an account
      const existingAccounts = await db.getAwsAccounts(userId);
      
      let result;
      if (existingAccounts.success && existingAccounts.accounts.length > 0) {
        // Update existing account
        const existingAccount = existingAccounts.accounts[0];
        result = await db.saveAwsAccount(userId, accountId, roleArn, externalId, regions);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to update AWS account');
        }
        
        return {
          success: true,
          account: result.account,
          updated: true
        };
      } else {
        // Create new account
        result = await db.saveAwsAccount(userId, accountId, roleArn, externalId, regions);
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to save AWS account');
        }
        
        return {
          success: true,
          account: result.account,
          updated: false
        };
      }
    } catch (error) {
      logger.error(`Error saving AWS account:`, error);
      throw new Error(`Failed to save AWS account: ${error.message}`);
    }
  }
  
  /**
   * Get AWS accounts for a user
   * @param {number} userId - User ID
   * @returns {Promise<Object>} - AWS accounts
   */
  async getAwsAccounts(userId) {
    try {
      const result = await db.getAwsAccounts(userId);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get AWS accounts');
      }
      
      return {
        success: true,
        accounts: result.accounts
      };
    } catch (error) {
      logger.error(`Error getting AWS accounts:`, error);
      throw new Error(`Failed to get AWS accounts: ${error.message}`);
    }
  }
  
  /**
   * Delete an AWS account
   * @param {number} accountId - Account ID to delete
   * @param {number} userId - User ID for verification
   * @returns {Promise<Object>} - Result
   */
  async deleteAwsAccount(accountId, userId) {
    try {
      const result = await db.deleteAwsAccount(accountId, userId);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete AWS account');
      }
      
      // Clear any cached clients for this account
      this._clearClientCache(accountId);
      
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting AWS account:`, error);
      throw new Error(`Failed to delete AWS account: ${error.message}`);
    }
  }
  
  /**
   * Apply resource scaling strategy
   * @param {string} strategy - Scaling strategy (auto, manual, predictive)
   * @param {Object} resources - Resource requirements
   * @param {Object} thresholds - Scaling thresholds
   * @param {number} accountId - AWS account ID from database
   * @param {string} region - AWS region to use
   * @returns {Promise<Object>} - Result
   */
  async applyResourceStrategy(strategy, resources, thresholds, accountId, region) {
    try {
      logger.info(`Applying ${strategy} scaling strategy for AWS account ${accountId} in region ${region}`);
      
      // Initialize clients for this account and region
      await this._initializeAwsClient(accountId, region);
      
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
  
  /**
   * Get current cloud resources
   * @param {number} accountId - AWS account ID from database
   * @param {string} region - AWS region to use
   * @returns {Promise<Object>} - Current resources
   */
  async getResources(accountId, region) {
    try {
      // Initialize client for this account and region
      await this._initializeAwsClient(accountId, region);
      
      // Get AWS resources
          return this._getAwsResources();
    } catch (error) {
      logger.error(`Error getting AWS resources:`, error);
      throw new Error(`Failed to get AWS resources: ${error.message}`);
    }
  }
  
  /**
   * Scale cloud resources
   * @param {string} resourceType - Resource type (cpu, memory, instances)
   * @param {number} amount - Amount to scale to
   * @param {number} accountId - AWS account ID from database
   * @param {string} region - AWS region to use
   * @returns {Promise<Object>} - Result
   */
  async scaleResources(resourceType, amount, accountId, region) {
    try {
      // Initialize client for this account and region
      await this._initializeAwsClient(accountId, region);
      
      // Scale AWS resources
          return this._scaleAwsResources(resourceType, amount);
    } catch (error) {
      logger.error(`Error scaling AWS resources:`, error);
      throw new Error(`Failed to scale AWS resources: ${error.message}`);
    }
  }
  
  /**
   * Create a new cluster
   * @param {string} name - Cluster name
   * @param {number} nodeCount - Number of nodes
   * @param {string} nodeType - Node type
   * @param {number} accountId - AWS account ID from database
   * @param {string} region - AWS region to use
   * @returns {Promise<Object>} - Result
   */
  async createCluster(name, nodeCount, nodeType, accountId, region) {
    try {
      // Initialize client for this account and region
      await this._initializeAwsClient(accountId, region);
      
      // Create AWS cluster
          return this._createAwsCluster(name, nodeCount, nodeType, region);
    } catch (error) {
      logger.error(`Error creating AWS cluster:`, error);
      throw new Error(`Failed to create AWS cluster: ${error.message}`);
    }
  }
  
  /**
   * Get all clusters
   * @param {number} accountId - AWS account ID from database
   * @param {string} region - AWS region to use
   * @returns {Promise<Array>} - Clusters
   */
  async getClusters(accountId, region) {
    try {
      // Initialize client for this account and region
      await this._initializeAwsClient(accountId, region);
      
      // Get AWS clusters
          return this._getAwsClusters();
    } catch (error) {
      logger.error(`Error getting AWS clusters:`, error);
      throw new Error(`Failed to get AWS clusters: ${error.message}`);
    }
  }
  
  // Private methods
  
  /**
   * Initialize AWS client using STS assume role
   * @param {number} accountId - AWS account ID from database
   * @param {string} region - AWS region to use
   * @returns {Promise<void>}
   * @private
   */
  async _initializeAwsClient(accountId, region) {
    const clientKey = `${accountId}-${region}`;
    
    // Check if we already have a client for this account/region
    if (this.awsClients[clientKey] && this._areCredentialsValid(this.temporaryCredentials[clientKey])) {
      logger.debug(`Using cached AWS client for account ${accountId} in region ${region}`);
      return;
    }
    
    try {
      if (!awsServices.STSClient) {
        throw new Error('AWS SDK v3 not installed or STS client not available');
      }
      
      // Get account credentials from database
      const result = await db.getAwsAccountCredentials(accountId);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to get AWS account credentials');
      }
      
      const account = result.account;
      
      // Verify that the requested region is in the allowed regions
      if (!account.regions.includes(region)) {
        throw new Error(`Region ${region} is not allowed for this AWS account`);
      }
      
      // Create STS client
      const sts = new awsServices.STSClient({ region });
      
      // Set up parameters for assuming the role
      const params = {
        RoleArn: account.role_arn,
        RoleSessionName: `LoadPredictions-${dayjs().unix()}`,
        DurationSeconds: 3600 // 1 hour
      };
      
      // Add external ID if provided
      if (account.external_id) {
        params.ExternalId = account.external_id;
      }
      
      // Assume the role
      const assumeRoleCommand = new awsServices.AssumeRoleCommand(params);
      const response = await sts.send(assumeRoleCommand);
      
      // Get the temporary credentials
      const credentials = {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
        expiration: response.Credentials.Expiration
      };
      
      // Save temporary credentials
      this.temporaryCredentials[clientKey] = credentials;
      
      // Create client configuration
      const clientConfig = {
        region,
        credentials
      };
      
      // Initialize AWS clients
      this.awsClients[clientKey] = {
        ec2: new awsServices.EC2Client(clientConfig),
        eks: new awsServices.EKSClient(clientConfig),
        autoscaling: new awsServices.AutoScalingClient(clientConfig),
        ec2Commands: awsServices.ec2Commands,
        eksCommands: awsServices.eksCommands,
        autoScalingCommands: awsServices.autoScalingCommands,
        region
      };
      
      logger.info(`AWS clients initialized for account ${account.account_id} in region ${region}`);
        } catch (error) {
      logger.error(`Error initializing AWS client: ${error.message}`);
      throw new Error(`Failed to initialize AWS client: ${error.message}`);
    }
  }
  
  /**
   * Check if temporary credentials are still valid
   * @param {Object} credentials - Temporary credentials to check
   * @returns {boolean} - Whether credentials are valid
   * @private
   */
  _areCredentialsValid(credentials) {
    if (!credentials || !credentials.expiration) {
      return false;
    }
    
    // Add a 5-minute buffer to avoid edge cases
    const expirationTime = new Date(credentials.expiration).getTime();
    const currentTime = new Date().getTime();
    const fiveMinutesInMs = 5 * 60 * 1000;
    
    return expirationTime - currentTime > fiveMinutesInMs;
  }
  
  /**
   * Clear client cache for a specific account
   * @param {number} accountId - Account ID to clear cache for
   * @private
   */
  _clearClientCache(accountId) {
    for (const key in this.awsClients) {
      if (key.startsWith(`${accountId}-`)) {
        delete this.awsClients[key];
        delete this.temporaryCredentials[key];
      }
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
      switch (strategy) {
        case 'auto':
          // For now, return a mock response
          // In a real implementation, this would configure AWS Auto Scaling
          return this._mockCloudResponse('aws', 'auto');
          
        case 'manual':
          // For now, return a mock response
          // In a real implementation, this would set a fixed instance size/count
          return this._mockCloudResponse('aws', 'manual');
          
        case 'predictive':
          // For now, return a mock response
          // In a real implementation, this would configure predictive scaling
          return this._mockCloudResponse('aws', 'predictive');
          
        default:
          throw new Error(`Unknown AWS strategy: ${strategy}`);
      }
    } catch (error) {
      logger.error('Error applying AWS strategy:', error);
      throw error;
    }
  }
  
  /**
   * Get AWS resources
   * @returns {Promise<Object>} - AWS resources
   * @private
   */
  async _getAwsResources() {
    const clientKey = Object.keys(this.awsClients)[0];
    if (!clientKey || !this.awsClients[clientKey].ec2) {
      return this._mockCloudResponse('aws', 'resources');
    }
    
    try {
      // Example of using AWS SDK v3 to describe instances
      // const command = new this.awsClients[clientKey].ec2Commands.DescribeInstancesCommand({});
      // const response = await this.awsClients[clientKey].ec2.send(command);
      
      // In a real implementation, this would process the response
      // and return actual resource usage
      
      // For now, return a mock response
      return this._mockCloudResponse('aws', 'resources');
    } catch (error) {
      logger.error('Error getting AWS resources:', error);
      throw error;
    }
  }
  
  /**
   * Scale AWS resources
   * @param {string} resourceType - Resource type
   * @param {number} amount - Amount to scale to
   * @returns {Promise<Object>} - Result
   * @private
   */
  async _scaleAwsResources(resourceType, amount) {
    const clientKey = Object.keys(this.awsClients)[0];
    if (!clientKey || !this.awsClients[clientKey].ec2) {
      return this._mockCloudResponse('aws', 'scale');
    }
    
    try {
      // Example of using AWS SDK v3 to update an Auto Scaling group
      // if (resourceType === 'instances') {
      //   const command = new this.awsClients[clientKey].autoScalingCommands.UpdateAutoScalingGroupCommand({
      //     AutoScalingGroupName: 'my-asg',
      //     DesiredCapacity: amount
      //   });
      //   await this.awsClients[clientKey].autoscaling.send(command);
      // }
      
      // For now, return a mock response
      return this._mockCloudResponse('aws', 'scale');
    } catch (error) {
      logger.error('Error scaling AWS resources:', error);
      throw error;
    }
  }
  
  /**
   * Create AWS cluster
   * @param {string} name - Cluster name
   * @param {number} nodeCount - Number of nodes
   * @param {string} nodeType - Node type
   * @param {string} region - Region
   * @returns {Promise<Object>} - Result
   * @private
   */
  async _createAwsCluster(name, nodeCount, nodeType, region) {
    const clientKey = Object.keys(this.awsClients)[0];
    if (!clientKey || !this.awsClients[clientKey].eks) {
      return this._mockCloudResponse('aws', 'cluster');
    }
    
    try {
      // Example of using AWS SDK v3 to create an EKS cluster
      // const command = new this.awsClients[clientKey].eksCommands.CreateClusterCommand({
      //   name,
      //   roleArn: 'arn:aws:iam::123456789012:role/eks-service-role',
      //   resourcesVpcConfig: {
      //     subnetIds: ['subnet-abcdef12', 'subnet-34567890']
      //   },
      //   version: '1.24'
      // });
      // await this.awsClients[clientKey].eks.send(command);
      
      // For now, return a mock response
      return this._mockCloudResponse('aws', 'cluster');
    } catch (error) {
      logger.error('Error creating AWS cluster:', error);
      throw error;
    }
  }
  
  /**
   * Get AWS clusters
   * @returns {Promise<Array>} - AWS clusters
   * @private
   */
  async _getAwsClusters() {
    const clientKey = Object.keys(this.awsClients)[0];
    if (!clientKey || !this.awsClients[clientKey].eks) {
      return this._mockCloudResponse('aws', 'clusters');
    }
    
    try {
      // Example of using AWS SDK v3 to list EKS clusters
      // const command = new this.awsClients[clientKey].eksCommands.ListClustersCommand({});
      // const response = await this.awsClients[clientKey].eks.send(command);
      // const clusterNames = response.clusters;
      
      // For now, return a mock response
      return this._mockCloudResponse('aws', 'clusters');
    } catch (error) {
      logger.error('Error getting AWS clusters:', error);
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
        
      case 'resources':
        return {
          provider,
          resources: {
            cpu: {
              total: 16,
              used: 8,
              available: 8
            },
            memory: {
              total: 64,
              used: 32,
              available: 32
            },
            instances: {
              running: 3,
              maxAllowed: 10
            }
          },
          timestamp
        };
        
      case 'scale':
        return {
          provider,
          scaled: true,
          timestamp,
          details: {
            resourceType: 'cpu',
            previous: 2,
            current: 4
          }
        };
        
      case 'cluster':
        return {
          provider,
          created: true,
          timestamp,
          details: {
            name: 'new-cluster',
            nodeCount: 3,
            nodeType: 't3.medium',
            status: 'CREATING'
          }
        };
        
      case 'clusters':
        return [
          {
            name: 'cluster-1',
            nodeCount: 3,
            nodeType: 't3.medium',
            status: 'RUNNING',
            created: '2023-01-01T00:00:00Z'
          },
          {
            name: 'cluster-2',
            nodeCount: 5,
            nodeType: 't3.large',
            status: 'RUNNING',
            created: '2023-02-01T00:00:00Z'
          }
        ];
        
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