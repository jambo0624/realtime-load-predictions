# ML Engine for Real-time Load Prediction

This directory contains the machine learning models and pipelines for predicting compute resource usage in real-time.

## Structure

The ML Engine is organized into two major versions:

- **Version 1 (v1)**: Basic implementation with fundamental features
- **Version 2 (v2)**: Advanced implementation with extensive feature engineering

Each version follows a consistent structure:

```
version/
├── preprocessing/     # Data cleaning and feature engineering
├── training/          # Model training and evaluation
├── prediction/        # Making predictions using trained models
├── data/              # Raw input data
├── processed_data/    # Cleaned and feature-engineered data
├── models/            # Trained model artifacts
└── prediction_results/# Prediction outputs and visualizations
```

## Data Fields

### Core Fields (v1)
- `time_dt`: Timestamp of the data point in datetime format
- `user`: User identifier
- `hour`: Hour of day (0-23)
- `resource_request_cpu`: Requested CPU resources
- `resource_request_memory`: Requested memory resources 
- `average_usage_cpu`: Average CPU usage 
- `average_usage_memory`: Average memory usage
- `maximum_usage_cpu`: Maximum CPU usage
- `maximum_usage_memory`: Maximum memory usage

### Extended Fields (v2)
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

## Models

### Version 1
Basic XGBoost regressor with default parameters for predicting resource usage.

### Version 2
Advanced XGBoost model with:
- Hyperparameter tuning through grid search cross-validation
- Feature importance analysis
- Recursive prediction for future time points
- Sophisticated feature handling to ensure correct order and type

## Usage

### Data Preprocessing

**Version 1 (Basic)**:
```bash
cd ml_engine/v1/preprocessing
run main.ipynb
```

**Version 2 (Advanced)**:
```bash
cd ml_engine/v2/preprocessing
run main.ipynb
```

### Model Training

**Version 1 (Basic)**:
```bash
cd ml_engine/v1/training
run main.ipynb
```

**Version 2 (Advanced)**:
For the ARIMA, Random Forest, XGBoost and LSTM models's training, evaluation and comparison, run the following command:
```bash
cd ml_engine/v2/training
run main.ipynb
```

For the XGBoost model's training, evaluation and comparison, run the following command:
```bash
cd ml_engine/v2/training
python XGBoost.py
```

### Prediction

**Version 2 (Standard prediction)**:
```bash
cd ml_engine/v2/prediction
python predict.py
```

**Version 2 (Future time point prediction)**:
```bash
cd ml_engine/v2/prediction
python predict_future.py
```

## Results

Prediction outputs include:
- CSV files with predicted values
- Visualizations comparing predictions to actual values
- For Version 2, future predictions with confidence intervals

## Metrics

The models are evaluated using:
- Mean Squared Error (MSE)
- Root Mean Squared Error (RMSE)
- Mean Absolute Error (MAE)
- R² (Coefficient of determination)
