import { useQuery } from '../lib/queryClient';
import { supabase } from '../lib/supabase';

export interface VarianceRow {
  stock_code?: string | null;
  description: string;
  lot_number: string;
  variance_units: number;
  event_id: string;
  warehouse_code: string;
}

export function useVariance(eventId?: string, warehouseCode?: string) {
  return useQuery({
    queryKey: ['variance', eventId, warehouseCode],
    enabled: Boolean(eventId && warehouseCode),
    queryFn: async () => {
      if (!eventId || !warehouseCode) return [] as VarianceRow[];
      const { data, error } = await supabase
        .from('manager_variance_view')
        .select('stock_code, description, lot_number, variance_units, event_id, warehouse_code')
        .eq('event_id', eventId)
        .eq('warehouse_code', warehouseCode)
        .order('variance_units', { ascending: true });

      if (error) throw error;
      return (data ?? []) as VarianceRow[];
    }
  });
}
