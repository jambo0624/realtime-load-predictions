# ML Engine for Real-time Load Prediction

This directory contains the machine learning models and pipelines for predicting compute resource usage in real-time.

## Structure

The ML Engine consists of the following structure:

```
├── data/               # Cluster 7 of raw input data
├── docs/               # Documentation of raw data
├── models/             # Trained model artifacts
├── preprocessing/      # Data cleaning and feature engineering
├── processed_data/     # Cleaned and feature-engineered data
├── prediction/         # Making predictions using trained models
├── prediction_results/ # Prediction outputs and visualizations
└── training/           # Model training and evaluation
```

[Full raw input data](https://www.kaggle.com/datasets/derrickmwiti/google-2019-cluster-sample/data) is available on Kaggle.

## Load Prediction

The real-time load prediction project features sophisticated feature engineering and modeling techniques.

### Features
- Comprehensive feature set including:
  - Temporal features (hour_of_day, day_of_week, etc.)
  - Cyclical encoding (hour_sin, hour_cos, day_sin, day_cos)
  - Lag features for time series analysis
  - Rolling window statistics (mean, std, min, max)
- Advanced XGBoost modeling with proper feature handling
- Future time point prediction capability

### Directory Structure
- `preprocessing/`: Advanced data cleaning and feature engineering
- `training/`: Enhanced model training with hyperparameter tuning
- `prediction/`: Scripts for both current data prediction and future forecasting
- `processed_data/`: Processed data
  - `visualization.ipynb`: Visualization of the processed data
- `models/`: Trained model artifacts, scaler, and feature importance analysis
- `prediction_results/`: Standard and future prediction outputs

### Model Enhancements
This implementation includes:

1. **Advanced Feature Engineering**
   - Time-based features for capturing periodicity
   - Lag features to model temporal dependencies
   - Statistical aggregations over various window sizes

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

## Data Fields

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

### Extended Fields
- `start_time_dt`: Start time of the task
- `end_time_dt`: End time of the task
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

## Models

Advanced XGBoost model with:
- Hyperparameter tuning through grid search cross-validation
- Feature importance analysis
- Recursive prediction for future time points

## Usage

### Data Preprocessing

```bash
cd ml_engine/preprocessing
run main.ipynb
```

### Model Training

For the ARIMA, Random Forest, XGBoost and LSTM models's training, evaluation and comparison:
```bash
cd ml_engine/training
run main.ipynb
```

For the XGBoost model's training, evaluation and comparison:
```bash
cd ml_engine/training
run XGBoost.ipynb
```

For the Random Forest model's training, evaluation and comparison:
```bash
cd ml_engine/training
run RF.ipynb
```

### Prediction

**XGBoost Model Prediction**:
```bash
cd ml_engine/prediction
run XGBoost.ipynb
```

**Future time point prediction**:
```bash
cd ml_engine/prediction
run RF.ipynb
```

## Results

Prediction outputs include:
- CSV files with predicted values
- Visualizations comparing predictions to actual values
- Future predictions with confidence intervals

## Metrics

The models are evaluated using:
- Mean Squared Error (MSE)
- Root Mean Squared Error (RMSE)
- Mean Absolute Error (MAE)
- R² (Coefficient of determination)
