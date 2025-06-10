import React, { useState, useContext, useEffect } from "react";
import { useNotification } from "../context/NotificationContext";
import apiService from "../api/apiService";
import { UserContext } from "../context/UserContext";
import { Popover, Text, Stack } from "@mantine/core";

/**
 * Popover component with information about predictive scaling
 */
const PredictiveScalingInfoPopover = () => {
  return (
    <Popover
      width={320}
      position="right"
      shadow="md"
      withArrow
      arrowPosition="center"
    >
      <Popover.Target>
        <div className="info-icon-button" title="Predictive Scaling Information">
          <span>ℹ️</span>
        </div>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack p="md" spacing="xs">
          <Text fw={600} size="md">Predictive Scaling</Text>
          <Text size="sm">
            Predictive scaling uses ML models trained on the past month of usage data
            to forecast future resource needs. The system automatically calculates
            optimal instance count based on predicted CPU usage patterns and applies
            scaling at 15-minute intervals.
          </Text>
          <Text size="sm" mt={5}>
            This ensures resources are provisioned ahead of demand,
            preventing both over-provisioning and performance issues.
          </Text>
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
};

/**
 * Resource Management component for configuring AWS resources
 */
const ResourceManagement = () => {
  const { currentUser } = useContext(UserContext);
  const isUserSelected = !!currentUser;

  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(false);
  const [loadingStrategy, setLoadingStrategy] = useState(false);

  // Region selection
  const [region, setRegion] = useState("us-east-1");

  // Scaling Strategy
  const [scalingStrategy, setScalingStrategy] = useState("auto");

  // Resource Configuration
  const [cpuResources, setCpuResources] = useState(2);
  const [memoryResources, setMemoryResources] = useState(4);
  const [maxInstances, setMaxInstances] = useState(5);
  const [minInstances, setMinInstances] = useState(1);

  // Threshold Configuration
  const [cpuThreshold, setCpuThreshold] = useState(70);
  const [memoryThreshold, setMemoryThreshold] = useState(70);

  // State for tracking predictive polling status
  const [predictionPollingActive, setPredictionPollingActive] = useState(false);
  const [predictionPollingInterval, setPredictionPollingInterval] = useState(null);

  // Load current strategy when user changes
  useEffect(() => {
    if (currentUser?.id) {
      loadCurrentStrategy(currentUser.id);
    }
  }, [currentUser]);

  // Load current strategy from backend
  const loadCurrentStrategy = async (userId) => {
    if (!userId) return;
    
    setLoadingStrategy(true);
    try {
      const response = await apiService.getCurrentStrategy(userId);
      
      if (response.status === 'success' && response.data) {
        const strategyData = response.data;
        
        // Update UI with current strategy
        setScalingStrategy(strategyData.strategy || 'auto');
        setRegion(strategyData.region || 'us-east-1');
        
        // Update resources if available
        if (strategyData.resources) {
          setCpuResources(strategyData.resources.cpu || 2);
          setMemoryResources(strategyData.resources.memory || 4);
          setMinInstances(strategyData.resources.minInstances || 1);
          setMaxInstances(strategyData.resources.maxInstances || 5);
        }
        
        // Update thresholds if available
        if (strategyData.thresholds) {
          setCpuThreshold(strategyData.thresholds.cpu || 70);
          setMemoryThreshold(strategyData.thresholds.memory || 70);
        }
        
        // Update polling status
        setPredictionPollingActive(!!strategyData.isPollingActive);
        setPredictionPollingInterval(
          strategyData.result?.details?.pollingInterval || '15 minutes'
        );
        
        console.log('Loaded current strategy:', strategyData.strategy);
      } else {
        console.log('No active strategy found for user');
      }
    } catch (error) {
      console.error('Error loading current strategy:', error);
    } finally {
      setLoadingStrategy(false);
    }
  };

  // AWS regions list
  const awsRegions = [
    { value: "us-east-1", label: "US East (N. Virginia)" },
    { value: "us-east-2", label: "US East (Ohio)" },
    { value: "us-west-1", label: "US West (N. California)" },
    { value: "us-west-2", label: "US West (Oregon)" },
    { value: "eu-west-1", label: "Europe (Ireland)" },
    { value: "eu-central-1", label: "Europe (Frankfurt)" },
    { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
    { value: "ap-northeast-2", label: "Asia Pacific (Seoul)" },
    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
    { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
    { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
    { value: "sa-east-1", label: "South America (São Paulo)" },
  ];

  // Apply Resource Strategy
  const handleApplyResourceStrategy = async () => {
    if (!isUserSelected) {
      showError("Please select a user first");
      return;
    }

    setLoading(true);

    try {
      // Prepare request data
      const strategyData = {
        strategy: scalingStrategy,
        resources: {
          cpu: cpuResources,
          memory: memoryResources,
          minInstances,
          maxInstances,
        },
        thresholds: {
          cpu: cpuThreshold,
          memory: memoryThreshold,
          userId: currentUser.id,
          cpuThresholdPerInstance: 70,
        },
        region: region,
      };

      // Call API
      const response = await apiService.applyResourceStrategy(strategyData);

      showSuccess(response.message || "Resource strategy applied successfully");
      
      // Show additional details for predictive strategy
      if (scalingStrategy === 'predictive' && response.data?.details) {
        const details = response.data.details;
        // Update polling status
        setPredictionPollingActive(!!details.pollingEnabled);
        setPredictionPollingInterval(details.pollingInterval || null);
        
        if (details.predictedMaxCpu) {
          showSuccess(`Predictive scaling applied based on ML predictions. 
            Peak CPU: ${details.predictedMaxCpu.toFixed(1)}%, 
            Instances: ${details.appliedInstances}`);
        }
      } else {
        // Reset polling status for non-predictive strategies
        setPredictionPollingActive(false);
        setPredictionPollingInterval(null);
      }
    } catch (err) {
      showError(err.message || "Error applying resource strategy");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="resource-management">
        <div className="header-with-info">
          <h2>AWS Resource Management</h2>
          <PredictiveScalingInfoPopover />
        </div>
        
        {loadingStrategy && (
          <div className="loading-indicator">
            <span>Loading current strategy...</span>
          </div>
        )}

        <div className="settings-container">
          <div className="settings-section strategy-settings">
            <div className="input-row">
              <div className="input-group">
                <label>
                  AWS Region:
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  >
                    {awsRegions.map((awsRegion) => (
                      <option key={awsRegion.value} value={awsRegion.value}>
                        {awsRegion.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

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
            </div>

            {scalingStrategy === "predictive" && predictionPollingActive && (
              <div className="prediction-info">
                {predictionPollingActive && (
                  <div className="polling-status">
                    <span className="polling-indicator active"></span>
                    <span>Active polling every {predictionPollingInterval}</span>
                  </div>
                )}
              </div>
            )}

            <div className="settings-group">
              {scalingStrategy === "manual" && (
                <>
                  <div className="input-row">
                    <div className="input-group">
                      <label>
                        CPU Resources:
                        <input
                          type="number"
                          min="1"
                          max="64"
                          value={cpuResources}
                          onChange={(e) =>
                            setCpuResources(parseInt(e.target.value))
                          }
                        />
                      </label>
                    </div>

                    <div className="input-group">
                      <label>
                        Memory Resources (GB):
                        <input
                          type="number"
                          min="1"
                          max="256"
                          value={memoryResources}
                          onChange={(e) =>
                            setMemoryResources(parseInt(e.target.value))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="input-group">
                    <label>
                      Instance Count:
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={minInstances}
                        onChange={(e) =>
                          setMinInstances(parseInt(e.target.value))
                        }
                      />
                    </label>
                  </div>
                </>
              )}

              {(scalingStrategy === "auto" ||
                scalingStrategy === "predictive") && (
                <>
                  <div className="input-row">
                    <div className="input-group">
                      <label>
                        CPU Threshold (%):
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={cpuThreshold}
                          onChange={(e) =>
                            setCpuThreshold(parseInt(e.target.value))
                          }
                        />
                      </label>
                    </div>

                    <div className="input-group">
                      <label>
                        Memory Threshold (%):
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={memoryThreshold}
                          onChange={(e) =>
                            setMemoryThreshold(parseInt(e.target.value))
                          }
                        />
                      </label>
                    </div>
                  </div>

                  <div className="input-row">
                    <div className="input-group">
                      <label>
                        Minimum Instances:
                        <input
                          type="number"
                          min="1"
                          max={maxInstances}
                          value={minInstances}
                          onChange={(e) =>
                            setMinInstances(parseInt(e.target.value))
                          }
                        />
                      </label>
                    </div>

                    <div className="input-group">
                      <label>
                        Maximum Instances:
                        <input
                          type="number"
                          min={minInstances}
                          max="20"
                          value={maxInstances}
                          onChange={(e) =>
                            setMaxInstances(parseInt(e.target.value))
                          }
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="action-buttons">
              <button
                onClick={handleApplyResourceStrategy}
                disabled={loading || !isUserSelected}
                className="btn-primary"
              >
                {loading ? "Applying..." : "Apply Strategy"}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .resource-management {
          flex: 1;
          padding: 12px;
          background-color: #f5f5f5;
          overflow: auto;
        }

        h2 {
          color: #2c3e50;
          font-size: 1.5rem;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 1px solid #eaeaea;
        }

        .settings-container {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .settings-section {
          background-color: #fff;
          border-radius: 4px;
          padding: 15px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          border: 1px solid #eaeaea;
        }

        .input-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 10px;
        }

        .input-group {
          flex: 1;
          min-width: 180px;
        }

        label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          font-size: 0.85rem;
          color: #555;
        }

        input,
        select {
          width: 100%;
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 3px;
          font-size: 0.9rem;
        }

        input:focus,
        select:focus {
          border-color: #4b9ad8;
          outline: none;
        }

        .settings-group {
          background-color: #fafafa;
          border-radius: 4px;
          padding: 12px;
          margin-top: 10px;
          border: 1px solid #eaeaea;
        }

        .prediction-info {
          background-color: #f0f7ff;
          border: 1px solid #d0e5ff;
          border-radius: 4px;
          padding: 10px 12px;
          margin: 10px 0;
          font-size: 0.85rem;
          color: #2c5282;
        }

        .polling-status {
          display: flex;
          align-items: center;
        }
        
        .polling-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 6px;
        }
        
        .polling-indicator.active {
          background-color: #48bb78;
          box-shadow: 0 0 0 2px rgba(72, 187, 120, 0.2);
        }

        .loading-indicator {
          background-color: #edf2f7;
          border-radius: 4px;
          padding: 8px 12px;
          margin-bottom: 12px;
          font-size: 0.85rem;
          color: #4a5568;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .action-buttons {
          margin-top: 15px;
          display: flex;
          justify-content: flex-end;
        }

        .btn-primary {
          background-color: #4b9ad8;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 3px;
          cursor: pointer;
          font-weight: 500;
        }

        .btn-primary:hover {
          background-color: #3d8bc7;
        }

        .btn-primary:disabled {
          background-color: #a0a0a0;
          cursor: not-allowed;
        }

        .header-with-info {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
        }

        .header-with-info h2 {
          margin: 0;
          margin-right: 10px;
          font-size: 1.2rem;
          color: #2c3e50;
        }
        
        .info-icon-button {
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          padding: 0;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s;
        }
        
        .info-icon-button:hover {
          background-color: rgba(0, 0, 0, 0.05);
        }

        @media (max-width: 768px) {
          .input-row {
            flex-direction: column;
            gap: 8px;
          }

          .input-group {
            min-width: 100%;
          }
        }
      `}</style>
    </>
  );
};

export default ResourceManagement;
