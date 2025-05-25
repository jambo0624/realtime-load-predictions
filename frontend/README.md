# Real-time Load Predictions Frontend

React-based frontend for visualizing CPU and memory load time series predictions in real-time.

## Features

- Visualize historical and predicted CPU/memory usage data
- Real-time updates via WebSocket connection
- Interactive dashboard with control panel
- Trigger data imports and predictions from the UI
- Responsive design for desktop and mobile

## Tech Stack

- **React**: UI library
- **React Router**: Navigation
- **Chart.js**: Data visualization
- **Socket.io Client**: Real-time WebSocket connection
- **Axios**: HTTP requests

## Installation

1. Ensure Node.js and pnpm are installed

2. Install dependencies
```bash
pnpm install
```

3. Configure environment
Create a `.env` file in the root directory to customize settings:
```
REACT_APP_API_URL=http://localhost:3000/api/data
REACT_APP_SOCKET_URL=http://localhost:3000
```

## Usage

### Start Development Server
```bash
pnpm start
```

### Build for Production
```bash
pnpm build
```

## File Structure

```
frontend/
  ├── public/            # Static files
  ├── src/
  │   ├── api/           # API and WebSocket services
  │   ├── components/    # React components
  │   ├── context/       # React context providers
  │   ├── hooks/         # Custom React hooks
  │   ├── pages/         # Page components
  │   ├── utils/         # Utility functions
  │   ├── App.js         # Main app component
  │   └── index.js       # Application entry point
  └── package.json       # Project configuration
```

## Using the Dashboard

1. The dashboard connects to the backend automatically on load
2. Choose between CPU and Memory usage data views
3. Use the control panel to:
   - Run predictions on specific data files
   - Import CSV data files
   - Refresh data manually
4. The chart displays:
   - Historical data (blue line)
   - Predictions (red dashed line)

## Integration with Backend

The frontend communicates with the backend via:
1. RESTful API for data fetching and triggering actions
2. WebSocket connection for real-time updates

Make sure the backend is running before starting the frontend. 