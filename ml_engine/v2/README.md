# Version 2: Advanced Load Prediction

This directory contains the second version of the real-time load prediction project, featuring sophisticated feature engineering and modeling techniques.

## Features
- Comprehensive feature set including:
  - All core fields from Version 1
  - Temporal features (hour_of_day, day_of_week, etc.)
  - Cyclical encoding (hour_sin, hour_cos, day_sin, day_cos)
  - Lag features for time series analysis
  - Rolling window statistics (mean, std, min, max)
  - Resource utilization ratios
- Advanced XGBoost modeling with proper feature handling
- Future time point prediction capability

## Directory Structure
- `preprocessing/`: Advanced data cleaning and feature engineering
- `training/`: Enhanced model training with hyperparameter tuning
- `prediction/`: Scripts for both current data prediction and future forecasting
- `processed_data/`: Processed data
  - `visualization.ipynb`: Visualization of the processed data
- `models/`: Trained model artifacts, scaler, and feature importance analysis
- `prediction_results/`: Standard and future prediction outputs

## Model Enhancements
Compared to Version 1, this implementation includes:

1. **Advanced Feature Engineering**
   - Time-based features for capturing periodicity
   - Lag features to model temporal dependencies
   - Statistical aggregations over various window sizes
   - Derived metrics for resource utilization

2. **Hyperparameter Tuning**
   - Grid search cross-validation for optimal parameters
   - Training/validation/test split for proper evaluation
   - Feature importance analysis and visualization

3. **Robust Prediction Framework**
   - Proper feature ordering and type handling
   - Error handling and validation
   - Feature compatibility checking

4. **Future Prediction Capabilities**
   - Recursive prediction for future time points
   - Time interval inference from historical data
   - Visualization of predictions with historical context

## Usage Flow
1. Run the preprocessing script to create the advanced feature set
2. Train the model with hyperparameter tuning
3. Use standard prediction for existing data points
4. Use future prediction for forecasting upcoming resource needs

## Output Artifacts
- Trained model with optimized hyperparameters
- Feature importance analysis
- Visualizations of predictions vs. actual values
- Future time point forecasts

## Data Fields Description

### Core Fields
- `time_dt`: Timestamp of the data point in datetime format
- `user`: User identifier
- `hour`: Hour of day (0-23)
- `resource_request_cpu`: Requested CPU resources
- `resource_request_memory`: Requested memory resources 
- `average_usage_cpu`: Average CPU usage 
- `average_usage_memory`: Average memory usage
- `maximum_usage_cpu`: Maximum CPU usage
- `maximum_usage_memory`: Maximum memory usage

### Extended Fields (Version 2)
- `start_time_dt`: Start time of the task
- `end_time_dt`: End time of the task
- `cpu_usage_distribution`: Distribution of CPU usage values
- `tail_cpu_usage_distribution`: Tail distribution of CPU usage
- `instance_index`: Instance identifier
- `event`: Event type identifier
- `hour_of_day`: Hour of day (0-23)
- `day_of_week`: Day of week (0-6, where 0 is Monday)
- `day_of_month`: Day of month (1-31)
- `month`: Month (1-12)
- `is_weekend`: Boolean flag indicating if the day is a weekend (1) or weekday (0)
- `day_part_*`: One-hot encoded variables for part of day (morning, afternoon, evening, night)
- `hour_sin`, `hour_cos`: Cyclical encoding of hour
- `day_sin`, `day_cos`: Cyclical encoding of day of week

### Lag Features
- `*_lag_1`, `*_lag_3`, `*_lag_6`, `*_lag_12`, `*_lag_24`: Value from 1, 3, 6, 12, and 24 time periods ago

### Rolling Window Features
- `*_rolling_mean_*`: Rolling average over window sizes (3, 6, 12, 24)
- `*_rolling_std_*`: Rolling standard deviation over window sizes
- `*_rolling_min_*`: Rolling minimum over window sizes
- `*_rolling_max_*`: Rolling maximum over window sizes

### Resource Utilization Features
- `cpu_utilization_ratio`: Ratio of actual CPU usage to requested resources
- `memory_utilization_ratio`: Ratio of actual memory usage to requested resources
- `resource_balance_ratio`: Ratio between CPU and memory utilization