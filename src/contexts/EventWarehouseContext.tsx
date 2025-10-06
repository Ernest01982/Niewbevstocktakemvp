import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const EVENT_STORAGE_KEY = 'nb-stocktake:selected-event';
const WAREHOUSE_STORAGE_KEY = 'nb-stocktake:selected-warehouse';

export interface EventOption {
  id: string;
  name: string;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface EventWarehouseContextValue {
  events: EventOption[];
  warehouses: WarehouseOption[];
  eventId?: string;
  warehouseCode?: string;
  loading: boolean;
  setEventId: (value: string) => void;
  setWarehouseCode: (value: string) => void;
  selectedEvent?: EventOption;
  selectedWarehouse?: WarehouseOption;
}

const EventWarehouseContext = createContext<EventWarehouseContextValue | undefined>(undefined);

function getStoredValue(key: string) {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch (error) {
    console.warn('Failed to read storage value', error);
    return undefined;
  }
}

function setStoredValue(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn('Failed to persist storage value', error);
  }
}

export function EventWarehouseProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [eventId, setEventIdState] = useState<string | undefined>(() => getStoredValue(EVENT_STORAGE_KEY));
  const [warehouseCode, setWarehouseCodeState] = useState<string | undefined>(() => getStoredValue(WAREHOUSE_STORAGE_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      try {
        const { data, error } = await supabase
          .from('stocktake_events')
          .select('id, name, status, starts_at, ends_at')
          .order('starts_at', { ascending: false });

        if (error) throw error;
        const mapped = (data ?? []).map((row) => ({
          id: row.id as string,
          name: (row.name as string) ?? 'Unnamed event',
          status: (row.status as string | null) ?? null,
          starts_at: (row.starts_at as string | null) ?? null,
          ends_at: (row.ends_at as string | null) ?? null
        }));
        setEvents(mapped);
        if (mapped.length > 0 && !eventId) {
          setEventIdState(mapped[0].id);
        }
      } catch (error) {
        console.error('Failed to load events', error);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }

    loadEvents();
  }, [eventId]);

  useEffect(() => {
    async function loadWarehouses() {
      if (!profile) {
        setWarehouses([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('warehouses')
          .select('id, code, name')
          .order('name', { ascending: true });

        if (error) throw error;
        let mapped = (data ?? []).map((row) => ({
          id: row.id as string,
          code: (row.code as string) ?? row.id,
          name: (row.name as string) ?? row.code ?? row.id
        }));

        if (profile.role === 'stocktaker') {
          const { data: assignments, error: assignmentError } = await supabase
            .from('user_warehouse_assignments')
            .select('warehouse_code')
            .eq('user_id', profile.id);

          if (assignmentError) throw assignmentError;
          const assignedCodes = new Set(
            (assignments ?? [])
              .map((assignment) => assignment.warehouse_code as string | undefined)
              .filter((code): code is string => Boolean(code))
          );
          if (assignedCodes.size > 0) {
            mapped = mapped.filter((warehouse) => assignedCodes.has(warehouse.code));
          }
        }

        setWarehouses(mapped);
        if (mapped.length > 0 && !warehouseCode) {
          setWarehouseCodeState(mapped[0].code);
        }
      } catch (error) {
        console.error('Failed to load warehouses', error);
        setWarehouses([]);
      }
    }

    loadWarehouses();
  }, [profile, warehouseCode]);

  useEffect(() => {
    if (eventId) {
      setStoredValue(EVENT_STORAGE_KEY, eventId);
    }
  }, [eventId]);

  useEffect(() => {
    if (warehouseCode) {
      setStoredValue(WAREHOUSE_STORAGE_KEY, warehouseCode);
    }
  }, [warehouseCode]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === eventId), [events, eventId]);
  const selectedWarehouse = useMemo(
    () => warehouses.find((warehouse) => warehouse.code === warehouseCode),
    [warehouseCode, warehouses]
  );

  const value = useMemo<EventWarehouseContextValue>(
    () => ({
      events,
      warehouses,
      eventId,
      warehouseCode,
      loading,
      selectedEvent,
      selectedWarehouse,
      setEventId: setEventIdState,
      setWarehouseCode: setWarehouseCodeState
    }),
    [eventId, events, loading, selectedEvent, selectedWarehouse, warehouseCode, warehouses]
  );

  return <EventWarehouseContext.Provider value={value}>{children}</EventWarehouseContext.Provider>;
}

export function useEventWarehouse() {
  const context = useContext(EventWarehouseContext);
  if (!context) {
    throw new Error('useEventWarehouse must be used within an EventWarehouseProvider');
  }
  return context;
}
