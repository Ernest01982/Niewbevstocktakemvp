import { supabase } from './supabase';

const baseQuery = () => supabase.from('product_pallet_view').select('*');

export function getByCaseBarcode(barcode: string) {
  return baseQuery().eq('case_barcode', barcode).maybeSingle();
}

export function getByUnitBarcode(barcode: string) {
  return baseQuery().eq('unit_barcode', barcode).maybeSingle();
}

export function getByStockCode(code: string) {
  return baseQuery().eq('stock_code', code).maybeSingle();
}
