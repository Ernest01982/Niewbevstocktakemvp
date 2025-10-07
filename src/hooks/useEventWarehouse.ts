import { useContext } from 'react';
import { EventWarehouseContext } from '../contexts/EventWarehouseContext';

export function useEventWarehouse() {
  const context = useContext(EventWarehouseContext);
  if (!context) {
    throw new Error('useEventWarehouse must be used within an EventWarehouseProvider');
  }
  return context;
}

