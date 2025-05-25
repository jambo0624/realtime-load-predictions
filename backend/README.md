# Real-time Load Predictions Backend

Node.js/Express backend service for managing CPU and memory load time series prediction data.

## Features

- Import historical data from CSV files
- Call Python XGBoost model to generate prediction data
- Push prediction results in real-time using WebSocket
- Provide data query interface via REST API
- Store historical data and prediction results in PostgreSQL database

## Tech Stack

- **Node.js**: Runtime environment
- **Express**: Web framework
- **PostgreSQL**: Database
- **Socket.io**: WebSocket support
- **Python**: Machine learning prediction model

## Installation

1. Ensure Node.js, pnpm and PostgreSQL are installed

2. Install dependencies
```bash
pnpm install
```

3. Create PostgreSQL database
```sql
CREATE DATABASE load_predictions;
```

4. Configure environment variables
```bash
cp .env.example .env
# Edit the .env file to set database connection information
```

## Usage

### Start the server
```bash
# Development mode
pnpm dev

# Production mode
pnpm start
```

### API Endpoints

- **Import data**: `POST /api/data/import`
- **Get historical data**: `GET /api/data/historical?target=cpu&limit=100`
- **Get prediction data**: `GET /api/data/predictions?target=cpu&limit=24`
- **Get combined data**: `GET /api/data/combined?target=cpu&historyLimit=100&predictionLimit=24`
- **Run prediction**: `POST /api/data/predict` (body: `{ "dataFile": "your_data_file.csv" }`)

### WebSocket Connection

Client connection example:
```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

// Subscribe to specific data type updates
socket.emit('subscribe', 'cpu');

// Receive initial data
socket.on('initialData', (data) => {
  console.log('Initial data:', data);
});

// Receive real-time updates
socket.on('dataUpdate', (data) => {
  console.log('Data update:', data);
});
```

## File Structure

```
backend/
  ├── src/
  │   ├── controllers/    # API route controllers
  │   ├── models/         # Data models
  │   ├── routes/         # API route definitions
  │   ├── services/       # Business logic
  │   ├── utils/          # Utility functions
  │   ├── config/         # Configuration
  │   └── index.js        # Application entry point
  ├── logs/               # Log files
  ├── .env                # Environment variables
  └── package.json        # Project configuration
```

## Data Flow

1. CSV data is imported into PostgreSQL database
2. Python XGBoost model is called to generate predictions
3. Prediction results are saved to the database
4. Data is provided to the frontend via REST API or WebSocket 