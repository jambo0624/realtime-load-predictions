import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { NotificationProvider } from './context/NotificationContext';
import { UserProvider } from './context/UserContext';
import Notifications from './components/Notifications';
import Dashboard from './pages/Dashboard';
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';

function App() {
  return (
    <MantineProvider>
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
    </MantineProvider>
  );
}

export default App; 