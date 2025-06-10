import React from 'react';
import ModelInfoPopover from './ModelInfoPopover';
import useData from '../hooks/useData';
/**
 * Control panel component showing status and information
 */
const ControlPanel = () => {
  const {
    connectionStatus, 
  } = useData();
  
  return (
    <div className="control-panel">
      <h2>Control Panel</h2>
      
      <div className="panel-section">
        <div className="panel-header">
          <div className="status-indicator">
            <div className="connection-status">
              WebSocket: <span className={connectionStatus}>{connectionStatus}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="status-item">
            <div className="status-label">System Status:</div>
            <div className="status-value active">Active</div>
          </div>
          <div className="status-item">
            <div className="status-label">Auto Processing:</div>
            <div className="status-value enabled">Enabled</div>
          </div>
        </div>

        <div className="auto-process-info">
          <h3>Automated Processing</h3>
          <p>
            Historical data is automatically imported and predictions are run when AWS client is initialized.
            All data processing is handled automatically by the system.
          </p>
          <div className="model-info-section">
            <h4>Model Information</h4>
            <div className="model-info-content">
              <ModelInfoPopover />
              <span>View prediction model details</span>
            </div>
          </div>
        </div>
      </div>
      
      <style jsx>{`
        .control-panel {
          background-color: #f5f5f5;
          border-radius: 4px;
          padding: 15px;
          height: 100%;
        }
        
        h2 {
          margin-top: 0;
          margin-bottom: 15px;
          font-size: 1.5rem;
        }
        
        h3 {
          margin-top: 0;
          margin-bottom: 0px;
          font-size: 1.2rem;
        }
        
        h4 {
          margin-top: 10px;
          margin-bottom: 8px;
          font-size: 1rem;
          color: #2e7d32;
        }
        
        .panel-section {
          background-color: white;
          border-radius: 4px;
          border: 1px solid #ddd;
          padding: 10px;
        }
        
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 9px;
        }
        
        .connection-status {
          font-size: 0.9rem;
        }
        
        .connection-status .connected {
          color: green;
          font-weight: bold;
        }
        
        .connection-status .disconnected {
          color: red;
          font-weight: bold;
        }
        
        .auto-process-info {
          background-color: #e8f5e9;
          border-radius: 4px;
          padding: 10px;
          margin: 10px 0;
          border-left: 4px solid #66bb6a;
        }
        
        .auto-process-info p {
          margin: 5px 0;
          font-size: 0.9rem;
          color: #2e7d32;
        }
        
        .model-info-section {
          margin-top: 10px;
        }
        
        .model-info-content {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.9rem;
          color: #2e7d32;
        }
        
        .status-item {
          display: flex;
          margin-bottom: 8px;
          font-size: 0.9rem;
        }
        
        .status-label {
          flex: 0 0 120px;
          font-weight: 500;
        }
        
        .status-value {
          flex: 1;
        }
        
        .status-value.active,
        .status-value.enabled {
          color: #2e7d32;
          font-weight: 500;
        }
        
        @media (max-width: 768px) {
          .status-item {
            flex-direction: column;
          }
          
          .status-label {
            margin-bottom: 3px;
          }
        }
        
        .info-button {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
};

export default ControlPanel; 