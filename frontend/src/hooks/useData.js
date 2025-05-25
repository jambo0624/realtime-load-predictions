import { useContext } from 'react';
import { DataContext } from '../context/DataContext';

/**
 * Custom hook for accessing the DataContext
 * @returns {Object} - DataContext value
 */
const useData = () => {
  const context = useContext(DataContext);
  
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  
  return context;
};

export default useData; 