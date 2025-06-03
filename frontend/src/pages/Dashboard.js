import React, { useContext } from 'react';
import LoadChart from '../components/LoadChart';
import ControlPanel from '../components/ControlPanel';
import Notifications from '../components/Notifications';
import ResourceManagement from '../components/ResourceManagement';
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
      
      <div className="control-resource-container">
        <div className="control-panel-wrapper">
          <ControlPanel />
        </div>
        <div className="resource-management-wrapper">
          <ResourceManagement isUserSelected={isUserSelected} />
        </div>
      </div>
      
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
      
      <Notifications />
      
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
          margin-bottom: 0;
        }
        
        .dashboard-header p {
          color: #666;
          margin: 0;
        }
        
        .control-resource-container {
          display: flex;
          flex-direction: row;
          gap: 20px;
          margin-bottom: 20px;
        }
        
        .control-panel-wrapper {
          flex: 1;
          min-width: 300px;
        }
        
        .resource-management-wrapper {
          flex: 2;
          min-width: 600px;
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
        
        /* Change to vertical layout on smaller screens */
        @media (max-width: 1100px) {
          .control-resource-container {
            flex-direction: column;
          }
          
          .control-panel-wrapper,
          .resource-management-wrapper {
            flex: none;
            width: 100%;
            min-width: 0;
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