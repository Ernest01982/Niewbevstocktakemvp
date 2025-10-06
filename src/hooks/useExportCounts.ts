import { useMutation } from '../lib/queryClient';
import { useSupabaseClientWithAuth } from './useSupabaseClientWithAuth';

interface ExportCountsPayload {
  eventId: string;
  warehouseCode: string;
}

export function useExportCounts() {
  const { fetchWithAuth } = useSupabaseClientWithAuth();

  return useMutation<Blob, ExportCountsPayload>({
    mutationFn: async ({ eventId, warehouseCode }) => {
      const params = new URLSearchParams({ event_id: eventId, warehouse_code: warehouseCode });
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-counts?${params.toString()}`;
      const response = await fetchWithAuth(url, { method: 'GET' });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to export counts');
      }
      return response.blob();
    }
  });
}
