/*
  # Add Inventory Management Fields and Bulk Upload Support

  1. Schema Updates
    - Add branch, location, expiry date fields to products table
    - Add stock on hand, allocated stock, available stock to products
    - Update stocktake_entries to include branch and location context
    - Add expiry_date to stocktake_entries for lot tracking
    
  2. New Tables
    - `bulk_uploads` - Track bulk upload operations
      - `id` (uuid, primary key)
      - `user_id` (uuid) - User who performed upload
      - `filename` (text) - Original filename
      - `records_total` (integer) - Total records in upload
      - `records_success` (integer) - Successfully imported records
      - `records_failed` (integer) - Failed records
      - `status` (text) - Upload status (processing, completed, failed)
      - `error_log` (jsonb) - Detailed error information
      - `created_at` (timestamptz)
    
  3. Important Notes
    - Products can now track multiple stock levels by branch/location
    - Available stock is calculated: stock_on_hand - allocated_stock
    - Expiry dates enable FEFO (First Expired First Out) tracking
    - Bulk uploads support CSV/Excel import with validation
*/

-- Add new fields to products table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'branch'
  ) THEN
    ALTER TABLE products ADD COLUMN branch text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'location'
  ) THEN
    ALTER TABLE products ADD COLUMN location text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'lot'
  ) THEN
    ALTER TABLE products ADD COLUMN lot text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE products ADD COLUMN expiry_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'stock_on_hand'
  ) THEN
    ALTER TABLE products ADD COLUMN stock_on_hand integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'allocated_stock'
  ) THEN
    ALTER TABLE products ADD COLUMN allocated_stock integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'available_stock'
  ) THEN
    ALTER TABLE products ADD COLUMN available_stock integer DEFAULT 0;
  END IF;
END $$;

-- Add new fields to stocktake_entries table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stocktake_entries' AND column_name = 'branch'
  ) THEN
    ALTER TABLE stocktake_entries ADD COLUMN branch text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stocktake_entries' AND column_name = 'location'
  ) THEN
    ALTER TABLE stocktake_entries ADD COLUMN location text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stocktake_entries' AND column_name = 'expiry_date'
  ) THEN
    ALTER TABLE stocktake_entries ADD COLUMN expiry_date date;
  END IF;
END $$;

-- Create bulk_uploads table
CREATE TABLE IF NOT EXISTS bulk_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  records_total integer DEFAULT 0,
  records_success integer DEFAULT 0,
  records_failed integer DEFAULT 0,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')) DEFAULT 'processing',
  error_log jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for bulk_uploads
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_user_id ON bulk_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_uploads_status ON bulk_uploads(status);
CREATE INDEX IF NOT EXISTS idx_products_branch_location ON products(branch, location);

-- Enable RLS on bulk_uploads
ALTER TABLE bulk_uploads ENABLE ROW LEVEL SECURITY;

-- Bulk uploads policies
CREATE POLICY "Users can view their own uploads"
  ON bulk_uploads FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Managers and Admins can view all uploads"
  ON bulk_uploads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Authenticated users can create uploads"
  ON bulk_uploads FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own uploads"
  ON bulk_uploads FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trigger for bulk_uploads updated_at
DROP TRIGGER IF EXISTS set_updated_at_bulk_uploads ON bulk_uploads;
CREATE TRIGGER set_updated_at_bulk_uploads
  BEFORE UPDATE ON bulk_uploads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to calculate available stock automatically
CREATE OR REPLACE FUNCTION calculate_available_stock()
RETURNS trigger AS $$
BEGIN
  NEW.available_stock := NEW.stock_on_hand - NEW.allocated_stock;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate available stock
DROP TRIGGER IF EXISTS calculate_available_stock_trigger ON products;
CREATE TRIGGER calculate_available_stock_trigger
  BEFORE INSERT OR UPDATE OF stock_on_hand, allocated_stock ON products
  FOR EACH ROW EXECUTE FUNCTION calculate_available_stock();

-- Update existing products to have correct available stock
UPDATE products 
SET available_stock = stock_on_hand - allocated_stock 
WHERE available_stock != (stock_on_hand - allocated_stock);

-- Update sample data with new fields
UPDATE products 
SET 
  branch = 'Main Warehouse',
  location = 'A-01',
  lot = 'LOT2024001',
  expiry_date = CURRENT_DATE + INTERVAL '365 days',
  stock_on_hand = expected_quantity,
  allocated_stock = 0,
  available_stock = expected_quantity
WHERE branch = '';

-- Comment on new columns
COMMENT ON COLUMN products.branch IS 'Branch or warehouse location';
COMMENT ON COLUMN products.location IS 'Specific location within branch (e.g., A-01, B-12)';
COMMENT ON COLUMN products.lot IS 'Lot or batch number';
COMMENT ON COLUMN products.expiry_date IS 'Product expiry date for FEFO tracking';
COMMENT ON COLUMN products.stock_on_hand IS 'Total physical stock available';
COMMENT ON COLUMN products.allocated_stock IS 'Stock allocated for orders/reservations';
COMMENT ON COLUMN products.available_stock IS 'Stock available for new orders (calculated)';
