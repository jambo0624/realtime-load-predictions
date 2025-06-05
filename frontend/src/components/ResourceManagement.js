import React, { useState } from 'react';
import { useNotification } from '../context/NotificationContext';
import apiService from '../api/apiService';

/**
 * Resource Management component for configuring cloud resources
 */
const ResourceManagement = ({ isUserSelected = false }) => {
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  
  // Cloud Provider Configuration
  const [cloudProvider, setCloudProvider] = useState('aws');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
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
  
  // Save Cloud Credentials
  const handleSaveCredentials = async () => {
    if (!apiKey || !apiSecret) {
      showError('API Key and Secret are required');
      return;
    }
    
    setLoading(true);
    
    try {
      // Here we need to add backend API call
      const response = await apiService.saveCloudCredentials({
        provider: cloudProvider,
        apiKey,
        apiSecret,
        region
      });
      
      showSuccess(response.message);
    } catch (err) {
      showError(err.message || 'Error saving credentials');
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
    
    setLoading(true);
    
    try {
      // Prepare request data
      const strategyData = {
        provider: cloudProvider,
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
        }
      };
      
      // Here we need to add backend API call
      const response = await apiService.applyResourceStrategy(strategyData);
      
      showSuccess(response.message);
    } catch (err) {
      showError(err.message || 'Error applying resource strategy');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="resource-management">
      <h2>Cloud Resource Management</h2>
      
      <div className="settings-container">
        <div className="settings-section provider-settings">
          <h3>Cloud Provider Settings</h3>
          
          <div className="input-groups">
            <div className="input-row">
              <div className="input-group">
                <label>
                  Cloud Provider:
                  <select 
                    value={cloudProvider} 
                    onChange={(e) => setCloudProvider(e.target.value)}
                  >
                    <option value="aws">AWS</option>
                    <option value="gcp">Google Cloud</option>
                    <option value="azure">Microsoft Azure</option>
                  </select>
                </label>
              </div>
              
              <div className="input-group">
                <label>
                  Region:
                  <select 
                    value={region} 
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {cloudProvider === 'aws' && (
                      <>
                        <option value="us-east-1">US East (N. Virginia)</option>
                        <option value="us-west-1">US West (N. California)</option>
                        <option value="eu-west-1">EU (Ireland)</option>
                        <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                      </>
                    )}
                    
                    {cloudProvider === 'gcp' && (
                      <>
                        <option value="us-central1">US Central (Iowa)</option>
                        <option value="us-east1">US East (South Carolina)</option>
                        <option value="europe-west1">Europe West (Belgium)</option>
                        <option value="asia-east1">Asia East (China)</option>
                      </>
                    )}
                    
                    {cloudProvider === 'azure' && (
                      <>
                        <option value="eastus">East US</option>
                        <option value="westus">West US</option>
                        <option value="northeurope">North Europe</option>
                        <option value="southeastasia">Southeast Asia</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
            </div>
            
            <div className="input-group">
              <label>
                API Key:
                <input 
                  type="password" 
                  value={apiKey} 
                  onChange={(e) => setApiKey(e.target.value)} 
                  placeholder="Enter your API key"
                />
              </label>
            </div>
            
            <div className="input-group">
              <label>
                API Secret:
                <input 
                  type="password" 
                  value={apiSecret} 
                  onChange={(e) => setApiSecret(e.target.value)} 
                  placeholder="Enter your API secret"
                />
              </label>
            </div>
          </div>
          
          <button 
            onClick={handleSaveCredentials} 
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Saving...' : 'Save Credentials'}
          </button>
        </div>
        
        <div className="settings-section strategy-settings">
          <h3>Resource Scaling Strategy</h3>
          
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
            disabled={loading || !isUserSelected}
            className="btn-primary"
          >
            {loading ? 'Applying...' : 'Apply Resource Strategy'}
          </button>
        </div>
      </div>
      
      <style jsx>{`
        .resource-management {
          background-color: #f5f5f5;
          border-radius: 4px;
          padding: 15px;
          height: 100%;
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
        
        button:hover {
          background-color: #357ab8;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
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