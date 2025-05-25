import React, { useState } from 'react';
import useData from '../hooks/useData';

/**
 * Control panel component for managing predictions
 */
const ControlPanel = () => {
  const { 
    activeTarget, 
    setActiveTarget, 
    connectionStatus, 
    runPrediction, 
    importData, 
    refreshData 
  } = useData();
  
  const [dataFile, setDataFile] = useState('c7_user_DrrEIEW_timeseries.csv');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  
  /**
   * Run prediction with specified data file
   */
  const handleRunPrediction = async () => {
    if (!dataFile) {
      setError('Please enter a data file name');
      return;
    }
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await runPrediction(dataFile);
      setResult(response);
      refreshData(); // Refresh data after prediction
    } catch (err) {
      setError(err.message || 'Error running prediction');
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Import data from CSV files
   */
  const handleImportData = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await importData();
      setResult(response);
      refreshData(); // Refresh data after import
    } catch (err) {
      setError(err.message || 'Error importing data');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="control-panel">
      <h2>Control Panel</h2>
      
      <div className="status-indicator">
        <div className="connection-status">
          WebSocket: <span className={connectionStatus}>{connectionStatus}</span>
        </div>
      </div>
      
      <div className="data-selection">
        <label>
          Data View:
          <select 
            value={activeTarget} 
            onChange={(e) => setActiveTarget(e.target.value)}
          >
            <option value="cpu">CPU Usage</option>
            <option value="memory">Memory Usage</option>
          </select>
        </label>
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
            disabled={loading}
          >
            {loading ? 'Running...' : 'Run Prediction'}
          </button>
          
          <button 
            onClick={handleImportData} 
            disabled={loading}
          >
            {loading ? 'Importing...' : 'Import Data'}
          </button>
          
          <button 
            onClick={refreshData} 
            disabled={loading}
          >
            Refresh Data
          </button>
        </div>
      </div>
      
      {error && (
        <div className="error-message">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}
      
      {result && (
        <div className="result-message">
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      
      <style jsx>{`
        .control-panel {
          background-color: #f5f5f5;
          border-radius: 4px;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .status-indicator {
          margin-bottom: 15px;
        }
        
        .connection-status .connected {
          color: green;
          font-weight: bold;
        }
        
        .connection-status .disconnected {
          color: red;
          font-weight: bold;
        }
        
        .data-selection {
          margin-bottom: 15px;
        }
        
        select {
          margin-left: 10px;
          padding: 5px;
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
        
        .error-message {
          margin-top: 15px;
          padding: 10px;
          background-color: #ffebee;
          border-left: 4px solid #f44336;
        }
        
        .result-message {
          margin-top: 15px;
          padding: 10px;
          background-color: #e8f5e9;
          border-left: 4px solid #4caf50;
          max-height: 200px;
          overflow: auto;
        }
        
        pre {
          white-space: pre-wrap;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
};

export default ControlPanel; 