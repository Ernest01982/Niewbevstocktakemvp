import { useMutation } from '../lib/queryClient';
import { useSupabaseClientWithAuth } from './useSupabaseClientWithAuth';
import type { RoiCropResult } from '../components/PhotoCapture';

export interface SubmitCountPayload {
  eventId: string;
  warehouseCode: string;
  stockCode?: string;
  caseBarcode?: string;
  unitBarcode?: string;
  recountTaskId?: string;
  singlesUnits?: number | null;
  singlesCases?: number | null;
  pickfaceLayers?: number | null;
  pickfaceCases?: number | null;
  bulkPallets?: number | null;
  bulkLayers?: number | null;
  bulkCases?: number | null;
  lotNumber?: string;
  photo?: File | null;
  roiCrops?: RoiCropResult | null;
}

interface SubmitCountResponse {
  ok: boolean;
  id: string;
  total_units: number;
  photo_path?: string;
}

export function useSubmitCount() {
  const { fetchWithAuth } = useSupabaseClientWithAuth();
  const mutation = useMutation<SubmitCountResponse, SubmitCountPayload>({
    mutationFn: async (payload) => {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-count`;
      const formData = new FormData();
      formData.append('event_id', payload.eventId);
      formData.append('warehouse_code', payload.warehouseCode);
      if (payload.stockCode) formData.append('stock_code', payload.stockCode);
      if (payload.caseBarcode) formData.append('case_barcode', payload.caseBarcode);
      if (payload.unitBarcode) formData.append('unit_barcode', payload.unitBarcode);
      if (payload.recountTaskId) formData.append('recount_task_id', payload.recountTaskId);

      appendNumber(formData, 'singles_units', payload.singlesUnits);
      appendNumber(formData, 'singles_cases', payload.singlesCases);
      appendNumber(formData, 'pickface_layers', payload.pickfaceLayers);
      appendNumber(formData, 'pickface_cases', payload.pickfaceCases);
      appendNumber(formData, 'bulk_pallets', payload.bulkPallets);
      appendNumber(formData, 'bulk_layers', payload.bulkLayers);
      appendNumber(formData, 'bulk_cases', payload.bulkCases);

      if (payload.lotNumber) {
        formData.append('lot_number', payload.lotNumber);
      }

      if (payload.photo) {
        formData.append('photo', payload.photo);
      }

      if (payload.roiCrops) {
        const { barcode, textTop, lot, hints } = payload.roiCrops;
        if (barcode) formData.append('photo_roi_barcode', barcode, 'roi-barcode.jpg');
        if (textTop) formData.append('photo_roi_text_top', textTop, 'roi-text-top.jpg');
        if (lot) formData.append('photo_roi_lot', lot, 'roi-lot.jpg');
        if (hints) formData.append('hints', JSON.stringify(hints));
      }

      const response = await fetchWithAuth(url, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to submit count');
      }

      return response.json();
    }
  });

  return mutation;
}

function appendNumber(formData: FormData, key: string, value: number | null | undefined) {
  if (value === null || value === undefined) return;
  if (Number.isNaN(value)) return;
  formData.append(key, String(value));
}
