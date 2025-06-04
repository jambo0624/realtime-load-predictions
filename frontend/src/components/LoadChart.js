import React, { useEffect, useState, useContext } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import dayjs from 'dayjs';
import { DataContext } from '../context/DataContext';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

/**
 * Chart component for displaying load data
 */
const LoadChart = ({ 
  historicalData = [], 
  predictionData = [], 
  target = 'cpu', 
  height = 300, 
  isUserSelected 
}) => {
  const [chartData, setChartData] = useState(null);
  const [maxValue, setMaxValue] = useState(0);
  
  // Get data window info
  const { dataWindow } = useContext(DataContext);
  
  useEffect(() => {
    if (!historicalData?.length && !predictionData?.length) {
      return;
    }
    
    // Prepare chart data
    prepareChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalData, predictionData, target, dataWindow]);
  
  /**
   * Prepare chart data from historical and prediction data
   */
  const prepareChartData = () => {
    // Target column name
    const column = target === 'cpu' ? 'average_usage_cpu' : 'average_usage_memory';
    
    // Format time labels with time info
    const formatTime = (timestamp) => {
      if (!timestamp) return '';
      return dayjs(timestamp).format('HH:mm');
    };
    
    // Extract data points and apply time window filtering
    let historicalTimes = [];
    let historicalValues = [];
    let predictionTimes = [];
    let predictionValues = [];
    
    // Handle historical data
    if (historicalData && historicalData.length > 0) {
      historicalTimes = historicalData.map(item => ({
        time: dayjs(item.time_dt).toDate(),
        label: formatTime(item.time_dt)
      }));
      historicalValues = historicalData.map(item => parseFloat(item[column] || 0));
    }
    
    // Handle prediction data
    if (predictionData && predictionData.length > 0) {
      predictionTimes = predictionData.map(item => ({
        time: dayjs(item.time_dt).toDate(),
        label: formatTime(item.time_dt)
      }));
      predictionValues = predictionData.map(item => parseFloat(item[column] || 0));
    }
    
    // Combine labels
    const allLabels = [...historicalTimes.map(t => t.label), ...predictionTimes.map(t => t.label)];
    const maxValue = Math.max(...historicalValues, ...predictionValues);
    setMaxValue(maxValue);
    
    // Set chart data
    setChartData({
      labels: allLabels,
      datasets: [
        {
          label: 'Historical Data',
          data: [...historicalValues, ...Array(predictionTimes.length).fill(null)],
          borderColor: 'rgba(75, 192, 192, 1)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          pointRadius: 1,
          borderWidth: 2,
          fill: false,
          tension: 0.1
        },
        {
          label: 'Predictions',
          data: [...Array(historicalTimes.length).fill(null), ...predictionValues],
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          pointRadius: 1,
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1
        }
      ]
    });
  };
  
  // Chart options
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 600 // Smooth animation effect
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: `${target.toUpperCase()} Usage Over Time`,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        displayColors: false,
        callbacks: {
          title: function(tooltipItems) {
            return `Time: ${tooltipItems[0].label}`;
          },
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.raw !== null) {
              label += context.raw.toFixed(4);
            }
            return label;
          }
        }
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: `${target.toUpperCase()} Usage`
        },
        max: maxValue * 1.2
      },
      x: {
        title: {
          display: true,
          text: 'Time'
        }
      }
    }
  };

  // If no user is selected, show a message
  if (!isUserSelected) {
    return <div>Please select a user to view the chart</div>;
  }
  
  // Show loading message if no data
  if (!chartData) {
    return <div>Loading chart data...</div>;
  }
  
  return (
    <div style={{ height: `${height}px` }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

export default LoadChart; 