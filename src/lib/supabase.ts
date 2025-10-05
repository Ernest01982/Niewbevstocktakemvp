import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'stocktaker' | 'manager' | 'admin';

export interface UserProfile {
  id: string;
  role: UserRole;
  full_name: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  product_name: string;
  barcode: string;
  pack_size: string;
  expected_quantity: number;
  unit_type: 'pallet' | 'case' | 'layer';
  branch: string;
  location: string;
  lot: string;
  expiry_date: string | null;
  stock_on_hand: number;
  allocated_stock: number;
  available_stock: number;
  created_at: string;
  updated_at: string;
}

export interface StocktakeEntry {
  id: string;
  user_id: string;
  product_id: string | null;
  image_url: string;
  extracted_product_name: string;
  extracted_barcode: string;
  extracted_lot_number: string;
  extracted_pack_size: string;
  actual_quantity: number;
  unit_type: 'pallet' | 'case' | 'layer';
  branch: string;
  location: string;
  expiry_date: string | null;
  synced: boolean;
  created_at: string;
  updated_at: string;
}

export interface VarianceReport {
  id: string;
  product_id: string;
  stocktake_entry_id: string;
  expected_quantity: number;
  actual_quantity: number;
  variance: number;
  variance_percentage: number;
  expected_units?: number | null;
  actual_units?: number | null;
  lot_number?: string | null;
  status: 'pending' | 'reviewed' | 'resolved';
  reviewed_by: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  product?: Product;
  stocktake_entry?: StocktakeEntry;
}

export interface BulkUpload {
  id: string;
  user_id: string;
  filename: string;
  records_total: number;
  records_success: number;
  records_failed: number;
  status: 'processing' | 'completed' | 'failed';
  error_log: Array<{ row: number; error: string }>;
  created_at: string;
  updated_at: string;
}

export interface ProductImportRow {
  product_number: string;
  product_description: string;
  lot: string;
  expiry_date: string;
  branch: string;
  location: string;
  stock_on_hand: number;
  allocated_stock: number;
  available_stock: number;
}
