import React, { useContext } from 'react';
import LoadChart from '../components/LoadChart';
import ControlPanel from '../components/ControlPanel';
import useData from '../hooks/useData';
import { UserContext } from '../context/UserContext';

/**
 * Dashboard page component showing load charts and controls
 */
const Dashboard = () => {
  const { 
    cpuData, 
    memoryData
  } = useData();

  const { currentUser } = useContext(UserContext);
  const isUserSelected = !!currentUser;

  // Check loading states
  const cpuIsLoading = cpuData.isLoading;
  const memoryIsLoading = memoryData.isLoading;

  // Check for errors
  const cpuError = cpuData.error;
  const memoryError = memoryData.error;
  
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Real-time Load Predictions Dashboard</h1>
        <p>Visualizing CPU and Memory usage predictions</p>
      </div>
      
      <ControlPanel isUserSelected={isUserSelected}/>
      
      <div className="charts-container">
        <div className="chart-container">
          <h2>CPU Usage Chart</h2>
          
          {cpuIsLoading && (
            <div className="loading-message">
              <p>Loading data...</p>
            </div>
          )}
          
          {cpuError && (
            <div className="error-message">
              <h3>Error Loading Data</h3>
              <p>{cpuError}</p>
            </div>
          )}
          
          {!cpuIsLoading && !cpuError && (
            <LoadChart 
              historicalData={cpuData.historical} 
              predictionData={cpuData.predictions} 
              isUserSelected={isUserSelected}
              target="cpu"
              height={350}
            />
          )}
        </div>
        
        <div className="chart-container">
          <h2>Memory Usage Chart</h2>
          
          {memoryIsLoading && (
            <div className="loading-message">
              <p>Loading data...</p>
            </div>
          )}
          
          {memoryError && (
            <div className="error-message">
              <h3>Error Loading Data</h3>
              <p>{memoryError}</p>
            </div>
          )}
          
          {!memoryIsLoading && !memoryError && (
            <LoadChart 
              historicalData={memoryData.historical} 
              predictionData={memoryData.predictions}
              isUserSelected={isUserSelected}
              target="memory"
              height={350}
            />
          )}
        </div>
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
        
        .charts-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        
        @media (min-width: 992px) {
          .charts-container {
            flex-direction: column;
          }
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