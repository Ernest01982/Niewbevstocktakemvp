import { useMutation } from '../lib/queryClient';
import { useSupabaseClientWithAuth } from './useSupabaseClientWithAuth';

export interface AssignRecountItem {
  stock_code: string;
  lot_number: string;
}

export interface AssignRecountsPayload {
  eventId: string;
  warehouseCode: string;
  items: AssignRecountItem[];
}

interface AssignRecountResponse {
  ok: boolean;
  created: number;
}

export function useAssignRecounts() {
  const { fetchWithAuth } = useSupabaseClientWithAuth();

  return useMutation<AssignRecountResponse, AssignRecountsPayload>({
    mutationFn: async ({ eventId, warehouseCode, items }) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/assign-recounts`;
      const response = await fetchWithAuth(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event_id: eventId,
          warehouse_code: warehouseCode,
          items
        })
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to assign recounts');
      }

      return response.json();
    }
  });
}
