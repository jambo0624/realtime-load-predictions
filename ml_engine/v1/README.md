# Version 1: Basic Load Prediction

This directory contains the first version of the real-time load prediction project, focusing on a simple implementation with core fields only.

## Features
- Limited set of features:
  - user
  - hour
  - resource_request_cpu
  - resource_request_memory
  - average_usage_cpu
  - average_usage_memory
  - maximum_usage_cpu
  - maximum_usage_memory
- Basic modeling approach without complex feature engineering

## Directory Structure
- `preprocessing/`: Code for data cleaning and preparation
- `training/`: Model training and evaluation scripts
- `processed_data/`: Preprocessed dataset ready for training

## Model Details
The V1 implementation uses a basic XGBoost regressor with default parameters:
- n_estimators: 100
- learning_rate: 0.1
- max_depth: 5

## Usage Flow
1. Run the preprocessing script to prepare the data
2. Train the model using the training script
3. Make predictions using the predict script

## Limitations
This version is intended as a baseline and has several limitations:
- Does not account for temporal patterns beyond hour of day
- No lag features for time series analysis
- Limited feature engineering
- No hyperparameter tuning
- No future time point prediction capability