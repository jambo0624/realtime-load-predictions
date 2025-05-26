import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { NotificationProvider } from './context/NotificationContext';
import Notifications from './components/Notifications';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <NotificationProvider>
        <DataProvider>
          <Notifications />
          <Routes>
            <Route path="/" element={<Dashboard />} />
          </Routes>
        </DataProvider>
      </NotificationProvider>
    </Router>
  );
}

export default App; 