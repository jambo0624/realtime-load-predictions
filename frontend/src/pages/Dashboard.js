import React from 'react';
import LoadChart from '../components/LoadChart';
import ControlPanel from '../components/ControlPanel';
import useData from '../hooks/useData';

/**
 * Dashboard page component showing load charts and controls
 */
const Dashboard = () => {
  const { 
    cpuData, 
    memoryData, 
    activeTarget,
  } = useData();
  
  // Display loading state if data isn't ready
  const isLoading = (activeTarget === 'cpu' && cpuData.isLoading) || 
                   (activeTarget === 'memory' && memoryData.isLoading);
  
  // Display error if there is one
  const error = (activeTarget === 'cpu' && cpuData.error) || 
               (activeTarget === 'memory' && memoryData.error);
  
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Real-time Load Predictions Dashboard</h1>
        <p>Visualizing CPU and Memory usage predictions</p>
      </div>
      
      <ControlPanel />
      
      <div className="chart-container">
        <h2>{activeTarget === 'cpu' ? 'CPU' : 'Memory'} Usage Chart</h2>
        
        {isLoading && (
          <div className="loading-message">
            <p>Loading data...</p>
          </div>
        )}
        
        {error && (
          <div className="error-message">
            <h3>Error Loading Data</h3>
            <p>{error}</p>
          </div>
        )}
        
        {!isLoading && !error && activeTarget === 'cpu' && (
          <LoadChart 
            historicalData={cpuData.historical} 
            predictionData={cpuData.predictions} 
            target="cpu"
            height={400}
          />
        )}
        
        {!isLoading && !error && activeTarget === 'memory' && (
          <LoadChart 
            historicalData={memoryData.historical} 
            predictionData={memoryData.predictions} 
            target="memory"
            height={400}
          />
        )}
      </div>
      
      <style jsx>{`
        .dashboard {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
          font-family: Arial, sans-serif;
        }
        
        .dashboard-header {
          text-align: center;
          margin-bottom: 30px;
        }
        
        .dashboard-header h1 {
          color: #333;
          margin-bottom: 10px;
        }
        
        .dashboard-header p {
          color: #666;
        }
        
        .chart-container {
          background-color: white;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          padding: 20px;
          margin-bottom: 20px;
        }
        
        .chart-container h2 {
          margin-top: 0;
          margin-bottom: 20px;
          color: #333;
        }
        
        .loading-message, .error-message {
          text-align: center;
          padding: 40px 0;
        }
        
        .error-message {
          color: #f44336;
        }
        
      `}</style>
    </div>
  );
};

export default Dashboard; 