import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <Router>
      <DataProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </DataProvider>
    </Router>
  );
}

export default App; 