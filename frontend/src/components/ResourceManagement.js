import React, { useState, useEffect, useContext } from 'react';
import { useNotification } from '../context/NotificationContext';
import apiService from '../api/apiService';
import { UserContext } from '../context/UserContext';

/**
 * Resource Management component for configuring AWS resources
 */
const ResourceManagement = () => {
  const { currentUser } = useContext(UserContext);
  const isUserSelected = !!currentUser;

  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [userAccount, setUserAccount] = useState(null);
  
  // AWS Account Configuration
  const [accountId, setAccountId] = useState('');
  const [roleArn, setRoleArn] = useState('');
  const [externalId, setExternalId] = useState('');
  const [region, setRegion] = useState('us-east-1');
  
  // Scaling Strategy
  const [scalingStrategy, setScalingStrategy] = useState('auto');
  
  // Resource Configuration
  const [cpuResources, setCpuResources] = useState(2);
  const [memoryResources, setMemoryResources] = useState(4);
  const [maxInstances, setMaxInstances] = useState(5);
  const [minInstances, setMinInstances] = useState(1);
  
  // Threshold Configuration
  const [cpuThreshold, setCpuThreshold] = useState(70);
  const [memoryThreshold, setMemoryThreshold] = useState(70);
  
  // AWS regions list
  const awsRegions = [
    { value: 'us-east-1', label: 'US East (N. Virginia)' },
    { value: 'us-east-2', label: 'US East (Ohio)' },
    { value: 'us-west-1', label: 'US West (N. California)' },
    { value: 'us-west-2', label: 'US West (Oregon)' },
    { value: 'eu-west-1', label: 'Europe (Ireland)' },
    { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
    { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
    { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)' },
    { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
    { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' },
    { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)' },
    { value: 'sa-east-1', label: 'South America (São Paulo)' }
  ];
  
  // Fetch AWS account on component mount or when user changes
  useEffect(() => {
    if (currentUser?.id) {
      fetchAwsAccount();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);
  
  // Fetch AWS account
  const fetchAwsAccount = async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    try {
      const response = await apiService.getAwsAccounts(currentUser.id);
      
      if (response.data && response.data.length > 0) {
        const account = response.data[0]; // Only get the first (and only) account
        setUserAccount(account);
      } else {
        setUserAccount(null);
      }
    } catch (err) {
      showError(err.message || 'Error fetching AWS account');
    } finally {
      setLoading(false);
    }
  };
  
  // Save or update AWS Account
  const handleSaveAccount = async () => {
    if (!currentUser?.id) {
      showError('No user selected');
      return;
    }
    
    if (!accountId || !roleArn || !region) {
      showError('Account ID, IAM Role ARN, and region are required');
      return;
    }
    
    // Validate AWS account ID (12 digits)
    if (!/^\d{12}$/.test(accountId)) {
      showError('AWS Account ID must be 12 digits');
      return;
    }
    
    // Validate Role ARN format
    if (!/^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/.test(roleArn)) {
      showError('Invalid IAM Role ARN format');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await apiService.saveAwsAccount({
        userId: currentUser.id,
        accountId,
        roleArn,
        externalId: externalId || null,
        regions: [region] // Now passing a single region in an array for backend compatibility
      });
      
      showSuccess(response.message);
      
      // Clear form
      setAccountId('');
      setRoleArn('');
      setExternalId('');
      setRegion('us-east-1');
      
      // Refresh account
      fetchAwsAccount();
    } catch (err) {
      showError(err.message || 'Error saving AWS account');
    } finally {
      setLoading(false);
    }
  };
  
  // Delete AWS Account
  const handleDeleteAccount = async () => {
    if (!currentUser?.id || !userAccount?.id) {
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete your AWS account?`)) {
      return;
    }
    
    setLoading(true);
    
    try {
      await apiService.deleteAwsAccount(userAccount.id, currentUser.id);
      showSuccess('AWS account deleted successfully');
      
      // Refresh account
      fetchAwsAccount();
    } catch (err) {
      showError(err.message || 'Error deleting AWS account');
    } finally {
      setLoading(false);
    }
  };
  
  // Apply Resource Strategy
  const handleApplyResourceStrategy = async () => {
    if (!isUserSelected) {
      showError('Please select a user first');
      return;
    }
    
    if (!userAccount) {
      showError('Please set up an AWS account first');
      return;
    }
    
    // Get the region from the user's account
    const region = userAccount.regions && userAccount.regions.length > 0 
      ? userAccount.regions[0] 
      : 'us-east-1';
      
    setLoading(true);
    
    try {
      // Prepare request data
      const strategyData = {
        strategy: scalingStrategy,
        resources: {
          cpu: cpuResources,
          memory: memoryResources,
          minInstances,
          maxInstances
        },
        thresholds: {
          cpu: cpuThreshold,
          memory: memoryThreshold
        },
        accountId: userAccount.id,
        region: region
      };
      
      // Call API
      const response = await apiService.applyResourceStrategy(strategyData);
      
      showSuccess(response.message);
    } catch (err) {
      showError(err.message || 'Error applying resource strategy');
    } finally {
      setLoading(false);
    }
  };
  
  // Render account setup form or account info
  const renderAccountSection = () => {
    if (!userAccount) {
      return (
        <div className="add-account-form">
          <div className="input-group">
            <label>
              Account ID (12 digits):
              <input 
                type="text" 
                value={accountId} 
                onChange={(e) => setAccountId(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="123456789012"
              />
            </label>
          </div>
          
          <div className="input-group">
            <label>
              IAM Role ARN:
              <input 
                type="text" 
                value={roleArn} 
                onChange={(e) => setRoleArn(e.target.value)} 
                placeholder="arn:aws:iam::123456789012:role/YourMonitoringRole"
              />
            </label>
          </div>
          
          <div className="input-group">
            <label>
              External ID (optional):
              <input 
                type="text" 
                value={externalId} 
                onChange={(e) => setExternalId(e.target.value)} 
                placeholder="Optional external ID for enhanced security"
              />
            </label>
          </div>
          
          <div className="input-group">
            <label>
              Region:
              <select 
                value={region} 
                onChange={(e) => setRegion(e.target.value)}
              >
                {awsRegions.map(awsRegion => (
                  <option key={awsRegion.value} value={awsRegion.value}>
                    {awsRegion.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          
          <button 
            onClick={handleSaveAccount} 
            disabled={loading || !currentUser?.id}
            className="btn-primary"
          >
            {loading ? 'Saving...' : 'Save Account'}
          </button>
        </div>
      );
    }
    
    // Show account info instead of form
    return (
      <div className="account-info-panel">
        <div className="account-details">
          <div className="detail-row">
            <span className="detail-label">Account ID:</span>
            <span className="detail-value">{userAccount.account_id}</span>
          </div>
          
          <div className="detail-row">
            <span className="detail-label">Region:</span>
            <span className="detail-value">{userAccount.regions && userAccount.regions[0]}</span>
          </div>
          
          <div className="detail-row">
            <span className="detail-label">Status:</span>
            <span className="detail-value status-active">
              {userAccount.enabled ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>
        
        <div className="account-actions">
          <button 
            className="btn-danger" 
            onClick={handleDeleteAccount}
            disabled={loading}
          >
            Delete Account
          </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="resource-management">
      <h2>Resource Management(AWS)</h2>
      
      <div className="settings-container">
        <div className="settings-section provider-settings">
          <h3>AWS Configuration</h3>
          
          <div className="aws-accounts">
            {renderAccountSection()}
          </div>
        </div>
        
        <div className="settings-section strategy-settings">
          <h3>Resource Scaling Strategy</h3>
          
          {!userAccount ? (
            <p>Please set up an AWS account first to configure resource scaling.</p>
          ) : (
            <>
              <div className="input-group">
                <label>
                  Scaling Strategy:
                  <select 
                    value={scalingStrategy} 
                    onChange={(e) => setScalingStrategy(e.target.value)}
                  >
                    <option value="auto">Auto Scaling</option>
                    <option value="manual">Manual Configuration</option>
                    <option value="predictive">Predictive Scaling</option>
                  </select>
                </label>
              </div>
              
              {scalingStrategy === 'auto' && (
                <div className="strategy-settings">
                  <div className="input-groups">
                    <div className="input-row">
                      <div className="input-group">
                        <label>
                          CPU Threshold (%):
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            value={cpuThreshold} 
                            onChange={(e) => setCpuThreshold(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label>
                          Memory Threshold (%):
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            value={memoryThreshold} 
                            onChange={(e) => setMemoryThreshold(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                    </div>
                    
                    <div className="input-row">
                      <div className="input-group">
                        <label>
                          Min Instances:
                          <input 
                            type="number" 
                            min="1"
                            value={minInstances} 
                            onChange={(e) => setMinInstances(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label>
                          Max Instances:
                          <input 
                            type="number" 
                            min="1"
                            value={maxInstances} 
                            onChange={(e) => setMaxInstances(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {scalingStrategy === 'manual' && (
                <div className="strategy-settings">
                  <div className="input-groups">
                    <div className="input-group">
                      <label>
                        CPU Resources (cores):
                        <input 
                          type="number" 
                          min="1"
                          value={cpuResources} 
                          onChange={(e) => setCpuResources(parseInt(e.target.value))} 
                        />
                      </label>
                    </div>
                    
                    <div className="input-group">
                      <label>
                        Memory Resources (GB):
                        <input 
                          type="number" 
                          min="1"
                          value={memoryResources} 
                          onChange={(e) => setMemoryResources(parseInt(e.target.value))} 
                        />
                      </label>
                    </div>
                    
                    <div className="input-group">
                      <label>
                        Number of Instances:
                        <input 
                          type="number" 
                          min="1"
                          value={minInstances} 
                          onChange={(e) => setMinInstances(parseInt(e.target.value))} 
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
              
              {scalingStrategy === 'predictive' && (
                <div className="strategy-settings">
                  <div className="input-groups">
                    <div className="input-row">
                      <div className="input-group">
                        <label>
                          CPU Buffer (%):
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            value={cpuThreshold} 
                            onChange={(e) => setCpuThreshold(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label>
                          Memory Buffer (%):
                          <input 
                            type="number" 
                            min="0"
                            max="100"
                            value={memoryThreshold} 
                            onChange={(e) => setMemoryThreshold(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                    </div>
                    
                    <div className="input-row">
                      <div className="input-group">
                        <label>
                          Min Instances:
                          <input 
                            type="number" 
                            min="1"
                            value={minInstances} 
                            onChange={(e) => setMinInstances(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                      
                      <div className="input-group">
                        <label>
                          Max Instances:
                          <input 
                            type="number" 
                            min="1"
                            value={maxInstances} 
                            onChange={(e) => setMaxInstances(parseInt(e.target.value))} 
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={handleApplyResourceStrategy} 
                disabled={loading || !isUserSelected || !userAccount}
                className="btn-primary"
              >
                {loading ? 'Applying...' : 'Apply Resource Strategy'}
              </button>
            </>
          )}
        </div>
      </div>
      
      <style jsx>{`
        .resource-management {
          background-color: #f5f5f5;
          border-radius: 4px;
          padding: 15px;
          height: 100%;
          overflow: auto;
        }
        
        .settings-container {
          display: flex;
          gap: 15px;
        }
        
        .settings-section {
          flex: 1;
          padding: 10px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: white;
        }
        
        h2 {
          margin-top: 0;
          margin-bottom: 15px;
          font-size: 1.5rem;
        }
        
        h3 {
          margin-top: 0;
          margin-bottom: 10px;
          font-size: 1.2rem;
        }
        
        h4 {
          margin-top: 15px;
          margin-bottom: 10px;
          font-size: 1rem;
        }
        
        .input-groups {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        
        .input-row {
          display: flex;
          gap: 10px;
        }
        
        .input-group {
          flex: 1;
          min-width: 140px;
          margin-top: 5px;
        }
        
        label {
          display: block;
          margin-bottom: 5px;
          font-size: 0.9rem;
        }
        
        input, select {
          padding: 6px;
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
          margin-top: 5px;
        }
        
        button {
          padding: 8px 12px;
          background-color: #4a90e2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 10px;
          width: 100%;
        }
        
        .btn-primary {
          background-color: #4a90e2;
          color: white;
        }
        
        .btn-danger {
          background-color: #ff4d4f;
          color: white;
        }
        
        .btn-danger:hover {
          background-color: #ff7875;
        }
        
        .btn-small {
          padding: 4px 8px;
          font-size: 0.8rem;
          margin-top: 5px;
          width: auto;
        }
        
        button:hover {
          background-color: #357ab8;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
        
        .account-info-panel {
          padding: 15px;
          border: 1px solid #e8e8e8;
          border-radius: 4px;
          background-color: #fafafa;
        }
        
        .account-details {
          margin-top: 15px;
          margin-bottom: 15px;
        }
        
        .detail-row {
          display: flex;
          margin-bottom: 8px;
        }
        
        .detail-label {
          font-weight: bold;
          width: 100px;
          flex-shrink: 0;
        }
        
        .detail-value {
          color: #666;
        }
        
        .status-active {
          color: #52c41a;
          font-weight: bold;
        }
        
        .account-actions {
          margin-top: 15px;
        }
        
        .selected-account {
          padding: 6px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background-color: #f5f5f5;
          margin-top: 5px;
        }
        
        .info-label {
          font-weight: bold;
          min-width: 100px;
        }
        
        .info-value {
          color: #555;
        }
        
        /* Responsive Layout */
        @media (max-width: 992px) {
          .settings-container {
            flex-direction: column;
          }
          
          .provider-settings,
          .strategy-settings {
            flex-basis: auto;
          }
        }
      `}</style>
    </div>
  );
};

export default ResourceManagement; 