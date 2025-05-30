import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { NotificationProvider } from './context/NotificationContext';
import { UserProvider } from './context/UserContext';
import Notifications from './components/Notifications';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <NotificationProvider>
        <UserProvider>
          <DataProvider>
            <Notifications />
            <Routes>
              <Route path="/" element={<Dashboard />} />
            </Routes>
          </DataProvider>
        </UserProvider>
      </NotificationProvider>
    </Router>
  );
}

export default App; 