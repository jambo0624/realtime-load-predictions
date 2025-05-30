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
      
      <div className="panel-row">
        <div className="status-indicator">
          <div className="connection-status">
            WebSocket: <span className={connectionStatus}>{connectionStatus}</span>
          </div>
        </div>
        
        <UserSelect />
      </div>
      
      <div className="prediction-controls">
        <h3>Run Prediction</h3>
        <div className="input-group">
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
          <button 
            onClick={handleRunPrediction} 
            disabled={loading || !isUserSelected}
          >
            {loading ? 'Running...' : 'Run Prediction'}
          </button>
          
          <button 
            onClick={handleImportSpecificFile} 
            disabled={loading}
          >
            {loading ? 'Importing...' : 'Import File'}
          </button>
          
          <button 
            onClick={handleImportData} 
            disabled={loading}
          >
            {loading ? 'Importing...' : 'Import All Files'}
          </button>
          
          <button 
            onClick={refreshData} 
            disabled={loading || !isUserSelected}
          >
            Refresh Data
          </button>
        </div>
      </div>
      
      <style jsx>{`
        .control-panel {
          background-color: #f5f5f5;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .panel-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .status-indicator {
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
          margin-top: 20px;
        }
        
        .input-group {
          margin-bottom: 15px;
        }
        
        input {
          margin-left: 10px;
          padding: 5px;
          width: 250px;
        }
        
        .button-group {
          display: flex;
          gap: 10px;
        }
        
        button {
          padding: 8px 12px;
          background-color: #4a90e2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        
        button:hover {
          background-color: #357ab8;
        }
        
        button:disabled {
          background-color: #cccccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default ControlPanel; 