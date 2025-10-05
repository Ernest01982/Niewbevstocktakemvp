/*
  # Create Pallet Configurations Table

  1. New Tables
    - `pallet_configurations`
      - `id` (uuid, primary key)
      - `product_name` (text) - Product name
      - `barcode` (text) - Product barcode/SKU (unique)
      - `units_per_case` (integer) - Number of units in one case
      - `cases_per_layer` (integer) - Number of cases in one layer
      - `layers_per_pallet` (integer) - Number of layers in one pallet
      - `units_per_pallet` (integer) - Total units per pallet (calculated)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS on `pallet_configurations` table
    - Allow managers and admins to create, read, update, delete
    - Allow stocktakers to read only
  
  3. Important Notes
    - Used by managers to set up pallet structures for products
    - Enables automatic unit conversion from pallet/case/layer counts
    - Links to products via barcode
    - Units per pallet = units_per_case × cases_per_layer × layers_per_pallet
*/

-- Create pallet_configurations table
CREATE TABLE IF NOT EXISTS pallet_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  barcode text UNIQUE NOT NULL,
  units_per_case integer NOT NULL DEFAULT 0,
  cases_per_layer integer NOT NULL DEFAULT 0,
  layers_per_pallet integer NOT NULL DEFAULT 0,
  units_per_pallet integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for barcode lookups
CREATE INDEX IF NOT EXISTS idx_pallet_configs_barcode ON pallet_configurations(barcode);

-- Enable RLS
ALTER TABLE pallet_configurations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read configurations
CREATE POLICY "All users can view pallet configurations"
  ON pallet_configurations FOR SELECT
  TO authenticated
  USING (true);

-- Allow managers and admins to insert configurations
CREATE POLICY "Managers and Admins can create pallet configurations"
  ON pallet_configurations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

-- Allow managers and admins to update configurations
CREATE POLICY "Managers and Admins can update pallet configurations"
  ON pallet_configurations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

-- Allow managers and admins to delete configurations
CREATE POLICY "Managers and Admins can delete pallet configurations"
  ON pallet_configurations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at_pallet_configurations ON pallet_configurations;
CREATE TRIGGER set_updated_at_pallet_configurations
  BEFORE UPDATE ON pallet_configurations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to convert counts to units based on pallet configuration
CREATE OR REPLACE FUNCTION convert_to_units(
  p_barcode text,
  p_quantity integer,
  p_unit_type text
) RETURNS integer AS $$
DECLARE
  v_config pallet_configurations%ROWTYPE;
  v_units integer;
BEGIN
  -- Get configuration for this product
  SELECT * INTO v_config
  FROM pallet_configurations
  WHERE barcode = p_barcode;

  -- If no config found, return original quantity
  IF NOT FOUND THEN
    RETURN p_quantity;
  END IF;

  -- Convert based on unit type
  CASE p_unit_type
    WHEN 'pallet' THEN
      v_units := p_quantity * v_config.units_per_pallet;
    WHEN 'layer' THEN
      v_units := p_quantity * v_config.units_per_case * v_config.cases_per_layer;
    WHEN 'case' THEN
      v_units := p_quantity * v_config.units_per_case;
    ELSE
      v_units := p_quantity;
  END CASE;

  RETURN v_units;
END;
$$ LANGUAGE plpgsql;

-- Comment on function
COMMENT ON FUNCTION convert_to_units IS 'Converts pallet/layer/case counts to units based on pallet configuration';
