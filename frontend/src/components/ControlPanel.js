import React, { useState } from 'react';
import useData from '../hooks/useData';
import { useNotification } from '../context/NotificationContext';
import UserSelect from './UserSelect';

/**
 * Control panel component for managing predictions
 */
const ControlPanel = ({ isUserSelected = false }) => {
  const {
    connectionStatus, 
    runPrediction, 
    importData, 
    importSpecificFile,
    refreshData 
  } = useData();
  
  const { showSuccess, showError } = useNotification();
  const [dataFile, setDataFile] = useState('c7_user_DrrEIEW_timeseries.csv');
  const [loading, setLoading] = useState(false);
  
  /**
   * Run prediction with specified data file
   */
  const handleRunPrediction = async () => {
    if (!isUserSelected) {
      showError('Please select a user');
      return;
    }
    
    if (!dataFile) {
      showError('Please enter a data file name');
      return;
    }
    
    setLoading(true);
    
    try {
      await runPrediction(dataFile);
      showSuccess('Prediction completed successfully');
      refreshData(); // Refresh data after prediction
    } catch (err) {
      showError(err.message || 'Error running prediction');
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Import data from CSV files
   */
  const handleImportData = async () => {
    setLoading(true);
    
    try {
      const response = await importData();
      showSuccess(`Imported all data successfully: ${response.message}`);
      refreshData(); // Refresh data after import
    } catch (err) {
      showError(err.message || 'Error importing data');
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Import specific file
   */
  const handleImportSpecificFile = async () => {
    if (!dataFile) {
      showError('Please enter a data file name');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await importSpecificFile(dataFile);
      showSuccess(`Imported file successfully: ${response.message}`);
      refreshData(); // Refresh data after import
    } catch (err) {
      showError(err.message || 'Error importing file');
    } finally {
      setLoading(false);
    }
  };
  
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
          
          <UserSelect />
        </div>
        
        <div className="prediction-controls">
          <h3>Run Prediction</h3>
          <div className="input-row">
            <label>
              Data File:
              <input 
                type="text" 
                disabled={true}
                value={dataFile} 
                onChange={(e) => setDataFile(e.target.value)} 
                placeholder="e.g., data.csv"
              />
            </label>
          </div>
          
          <div className="button-group">
            <div className="button-row">
              <button 
                onClick={handleRunPrediction} 
                disabled={loading || !isUserSelected}
                className="btn-primary"
              >
                {loading ? 'Running...' : 'Run Prediction'}
              </button>
              
              <button 
                onClick={handleImportSpecificFile} 
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? 'Importing...' : 'Import File'}
              </button>
            </div>
            
            <div className="button-row">
              <button 
                onClick={handleImportData} 
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? 'Importing...' : 'Import All Files'}
              </button>
              
              <button 
                onClick={refreshData} 
                disabled={loading || !isUserSelected}
                className="btn-refresh"
              >
                Refresh Data
              </button>
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
          margin-bottom: 10px;
          font-size: 1.2rem;
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
          margin-bottom: 15px;
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
        
        .prediction-controls {
          margin-top: 10px;
        }
        
        .input-row {
        }
        
        label {
          display: block;
          margin-bottom: 5px;
          font-size: 0.9rem;
        }
        
        input {
          padding: 6px;
          width: 100%;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .button-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .button-row {
          display: flex;
          gap: 8px;
        }
        
        button {
          padding: 8px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          flex: 1;
        }
        
        .btn-primary {
          background-color: #4a90e2;
          color: white;
        }
        
        .btn-secondary {
          background-color: #f0f0f0;
          color: #333;
          border: 1px solid #ddd;
        }
        
        .btn-refresh {
          background-color: #5cb85c;
          color: white;
        }
        
        button:hover {
          opacity: 0.9;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
          opacity: 0.7;
        }
        
        @media (max-width: 768px) {
          button {
            flex: 1 1 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default ControlPanel; 