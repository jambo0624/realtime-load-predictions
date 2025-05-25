require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 8080,
  
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'load_predictions',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  },
  
  pythonScriptPath: process.env.PYTHON_SCRIPT_PATH || '../ml_engine/prediction/xgb.py',
  dataPath: process.env.DATA_PATH || '../ml_engine/processed_data/',
  predictionResultsPath: process.env.PREDICTION_RESULTS_PATH || '../../../ml_engine/prediction_results'
}; 