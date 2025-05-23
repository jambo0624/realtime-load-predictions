#!/usr/bin/env python
# -*- coding: utf-8 -*-

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import os
import joblib
import warnings
warnings.filterwarnings('ignore')

from sklearn.model_selection import train_test_split, TimeSeriesSplit, GridSearchCV
from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import xgboost as xgb

plt.style.use('ggplot')
sns.set(style="whitegrid")

pd.set_option('display.max_columns', None)
pd.set_option('display.max_rows', 100)
pd.set_option('display.width', 1000)


# 1. Data Loading and Exploration
def load_and_explore_data(data_path):
    """Load and explore the dataset"""
    print(f"Loading data: {data_path}")
    
    try:
        df = pd.read_csv(data_path)
        print(f"Successfully read data, shape: {df.shape}")
        
        # Display first few rows
        print("\nData preview:")
        print(df.head())
        
        # View basic information
        print("\nData information:")
        df.info()
        
        # Check missing values
        missing_values = df.isnull().sum()
        missing_percentage = (missing_values / len(df)) * 100
        
        missing_df = pd.DataFrame({
            'Missing Count': missing_values,
            'Missing Percentage': missing_percentage
        }).sort_values('Missing Percentage', ascending=False)
        
        print("\nMissing values:")
        print(missing_df[missing_df['Missing Count'] > 0])
        
        return df
    
    except Exception as e:
        print(f"Error reading data: {e}")
        return None


# 2. Time Feature Processing
def process_time_features(df):
    """Process and convert time features"""
    print("\nProcessing time features...")
    
    # Check and convert time features
    time_columns = [col for col in df.columns if 'time' in col.lower() and 'dt' not in col.lower()]
    print(f"Time-related columns: {time_columns}")
    
    for col in time_columns:
        if col in df.columns:
            if df[col].dtype == 'int64' or df[col].dtype == 'float64':
                df[f'{col}_dt'] = pd.to_datetime(df[col], unit='us')
                print(f"Converting column {col} to datetime format")
    
    # Ensure time series index
    if 'time_dt' in df.columns:
        df = df.sort_values('time_dt').reset_index(drop=True)
        print("Data sorted by time")
    
    return df


# 3. Feature Engineering
def create_time_features(df):
    """Create rich time features from time column"""
    print("\nCreating time features...")
    
    if 'time_dt' not in df.columns:
        print("Column time_dt does not exist, cannot create time features")
        return df
    
    # Create features from datetime
    df['hour_of_day'] = df['time_dt'].dt.hour
    df['day_of_week'] = df['time_dt'].dt.dayofweek
    df['day_of_month'] = df['time_dt'].dt.day
    df['month'] = df['time_dt'].dt.month
    
    # Create weekend indicator (0=weekday, 1=weekend)
    df['is_weekend'] = df['day_of_week'].apply(lambda x: 1 if x >= 5 else 0)
    
    # Create time of day classification
    def get_day_part(hour):
        if 5 <= hour < 12:
            return 'morning'
        elif 12 <= hour < 17:
            return 'afternoon'
        elif 17 <= hour < 22:
            return 'evening'
        else:
            return 'night'
    
    df['day_part'] = df['hour_of_day'].apply(get_day_part)
    
    # One-hot encode time periods
    df = pd.get_dummies(df, columns=['day_part'], prefix='day_part')
    
    # Create cyclic features for hour and date (sine and cosine transformations)
    df['hour_sin'] = np.sin(2 * np.pi * df['hour_of_day'] / 24)
    df['hour_cos'] = np.cos(2 * np.pi * df['hour_of_day'] / 24)
    df['day_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
    df['day_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
    
    print("Time features created")
    return df


def create_lag_features(df, target_cols, lag_periods=[1, 3, 6, 12, 24]):
    """Create lag features for target columns"""
    print("\nCreating lag features...")
    
    # Create features for each target column and lag period
    for target in target_cols:
        for lag in lag_periods:
            # Create lag feature
            df[f'{target}_lag_{lag}'] = df[target].shift(lag)
    
    print("Lag features created")
    return df


def create_rolling_features(df, target_cols, windows=[3, 6, 12, 24]):
    """Create rolling window statistical features for target columns"""
    print("\nCreating rolling window features...")
    
    # Create features for each target column and window
    for target in target_cols:
        for window in windows:
            # Create rolling mean
            df[f'{target}_rolling_mean_{window}'] = df[target].rolling(window=window, min_periods=1).mean()
            # Create rolling standard deviation
            df[f'{target}_rolling_std_{window}'] = df[target].rolling(window=window, min_periods=1).std()
            # Create rolling min and max
            df[f'{target}_rolling_min_{window}'] = df[target].rolling(window=window, min_periods=1).min()
            df[f'{target}_rolling_max_{window}'] = df[target].rolling(window=window, min_periods=1).max()
    
    print("Rolling window features created")
    return df


def prepare_data_for_modeling(df, target_vars):
    """Prepare data for model training"""
    print("\nPreparing data for modeling...")
    
    # Handle missing values
    print("Handling missing values...")
    for col in df.columns:
        if df[col].isnull().sum() > 0:
            if df[col].dtype in ['int64', 'float64']:
                # Fill numeric columns with median
                df[col] = df[col].fillna(df[col].median())
            else:
                # Fill non-numeric columns with mode
                df[col] = df[col].fillna(df[col].mode()[0])
    
    # Remove unnecessary columns
    cols_to_drop = []
    
    # Remove high-cardinality ID columns
    id_cols = [col for col in df.columns if 'id' in col.lower() or 'name' in col.lower() or 'user' in col.lower()]
    cols_to_drop.extend(id_cols)
    
    # Remove original timestamp columns (keep converted dt columns)
    timestamp_cols = [col for col in df.columns if ('time' in col.lower() and 'dt' not in col.lower())]
    cols_to_drop.extend(timestamp_cols)
    
    # Exclude target variables
    cols_to_drop = [col for col in cols_to_drop if col not in target_vars]
    
    # Remove columns that are all NaN
    null_cols = df.columns[df.isnull().all()].tolist()
    cols_to_drop.extend(null_cols)
    
    # Drop columns
    df = df.drop(columns=[col for col in cols_to_drop if col in df.columns], errors='ignore')
    print(f"Dropped {len(cols_to_drop)} columns")
    
    # Convert categorical variables to numeric
    object_cols = df.select_dtypes(include=['object']).columns
    for col in object_cols:
        if col not in target_vars:  # Don't convert target variables
            # Label encode categorical variables
            df[col] = pd.factorize(df[col])[0]
    
    print("Data preparation complete")
    return df


# 4. Model Building and Evaluation
def evaluate_models(df, target_var, test_size=0.2, random_state=42):
    """Build and evaluate prediction models"""
    print(f"\nEvaluating prediction models for {target_var}...")
    
    # Prepare features and target
    y = df[target_var]
    X = df.drop(columns=[col for col in df.columns if col in [target_var] or col.startswith('time_')])
    
    print(f"Number of features: {X.shape[1]}")
    print(f"Number of samples: {X.shape[0]}")
    
    # Create training and test sets (time series split)
    # To ensure we don't use future data to predict the past, use the last test_size proportion as test set
    split_idx = int(len(X) * (1 - test_size))
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    
    print(f"Training set shape: {X_train.shape}, Test set shape: {X_test.shape}")
    
    # Feature standardization
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Model results storage
    model_results = []
    
    # 1. XGBoost
    print("\nTraining XGBoost...")
    xgb_model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.1, random_state=random_state)
    xgb_model.fit(X_train_scaled, y_train)
    
    # Predictions
    xgb_preds = xgb_model.predict(X_test_scaled)
    
    # Evaluation
    rmse = np.sqrt(mean_squared_error(y_test, xgb_preds))
    mae = mean_absolute_error(y_test, xgb_preds)
    r2 = r2_score(y_test, xgb_preds)
    
    print(f"XGBoost - RMSE: {rmse:.6f}, MAE: {mae:.6f}, R²: {r2:.6f}")
    model_results.append({"model": "XGBoost", "rmse": rmse, "mae": mae, "r2": r2})
    
    # Summary results
    results_df = pd.DataFrame(model_results)
    results_df = results_df.sort_values('rmse')
    
    print("\nModel Performance Summary:")
    print(results_df)
    
    # Return best model and evaluation results
    return results_df, feature_importance

# Main function
def main():
    """Main function"""
    print("Starting advanced load prediction modeling...")
    
    # 1. Load data
    data_path = '../processed_data/c7_user_DrrEIEW_timeseries.csv'
    df = load_and_explore_data(data_path)
    
    if df is None:
        print("Unable to load data, program terminated")
        return
    
    # 2. Time feature processing
    df = process_time_features(df)
    
    # 3. Define target variables
    target_vars = ['average_usage_cpu', 'average_usage_memory']
    target_vars = [var for var in target_vars if var in df.columns]
    
    if not target_vars:
        print("No target variables found, program terminated")
        return
    
    print(f"Target variables: {target_vars}")
    
    # 4. Feature engineering
    df = create_time_features(df)
    df = create_lag_features(df, target_vars)
    df = create_rolling_features(df, target_vars)
    
    # 5. Prepare modeling data
    df = prepare_data_for_modeling(df, target_vars)
    
    # 6. Build models for each target variable
    for target_var in target_vars:
        # Filter out rows with NaN
        df_clean = df.dropna(subset=[target_var])
        
        # Filter out lag features of other target variables
        other_targets = [t for t in target_vars if t != target_var]
        cols_to_drop = []
        for other_target in other_targets:
            cols_to_drop.extend([col for col in df_clean.columns if col.startswith(f"{other_target}_lag_")])
            cols_to_drop.extend([col for col in df_clean.columns if col.startswith(f"{other_target}_rolling_")])
        
        df_model = df_clean.drop(columns=cols_to_drop, errors='ignore')
        
        # Build and evaluate models
        evaluate_models(df_model, target_var)
        
    
    print("Modeling completed!")


if __name__ == "__main__":
    main()