# Real-time Load Prediction

A comprehensive platform for predicting and managing compute resource usage in real-time.

## Project Structure

This project is organized into three main components:

- **ML Engine**: Machine learning models for predicting CPU and memory usage
- **Backend**: API services and data processing pipelines (future development)
- **Frontend**: User interface for visualizing predictions and metrics (future development)

## ML Engine

The ML Engine contains two versions of our prediction models:

- **Version 1 (v1)**: Basic implementation with limited features
- **Version 2 (v2)**: Advanced implementation with rich feature engineering

Each version includes preprocessing, training, and prediction components.

### Data Features

Detailed data field descriptions can be found in the ML Engine documentation.

#### Basic Features (v1)
- user
- hour
- resource_request_cpu
- resource_request_memory
- average_usage_cpu
- average_usage_memory
- maximum_usage_cpu
- maximum_usage_memory

#### Advanced Features (v2)
In addition to basic features:
- Detailed time features (hour, day of week, month, etc.)
- Cyclical encoding for temporal variables
- Lag features for time series analysis
- Rolling window statistics (mean, std, min, max)
- Resource utilization metrics

## Future Development

### Backend Services (Planned)
- REST API for prediction services
- Data streaming and processing pipelines
- Authentication and authorization
- Monitoring and logging services

### Frontend (Planned)
- Interactive dashboards for resource usage visualization
- Prediction analysis and exploration tools
- User management interface
- Alert configuration for resource anomalies
