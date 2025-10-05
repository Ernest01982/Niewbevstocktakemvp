/*
  # Update Variance Reports with Unit Conversion

  1. Updates
    - Modify variance report generation to convert counts to units
    - Compare against stock_on_hand instead of expected_quantity
    - Add actual_units and expected_units columns for clarity
  
  2. Changes
    - Add actual_units column to variance_reports
    - Add expected_units column (renamed from expected_quantity conceptually)
    - Update variance calculation function to use unit conversion
    - Variance compares stock_on_hand (in units) vs actual count (converted to units)
  
  3. Important Notes
    - Stocktaker counts in pallets/cases/layers
    - System converts to units using pallet_configurations
    - Variance = stock_on_hand - actual_units
    - Counts are matched by product name AND lot number
*/

-- Add new columns to variance_reports for unit tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variance_reports' AND column_name = 'actual_units'
  ) THEN
    ALTER TABLE variance_reports ADD COLUMN actual_units integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variance_reports' AND column_name = 'expected_units'
  ) THEN
    ALTER TABLE variance_reports ADD COLUMN expected_units integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'variance_reports' AND column_name = 'lot_number'
  ) THEN
    ALTER TABLE variance_reports ADD COLUMN lot_number text DEFAULT '';
  END IF;
END $$;

-- Drop and recreate the variance calculation trigger function with unit conversion
DROP TRIGGER IF EXISTS create_variance_report_trigger ON stocktake_entries;
DROP FUNCTION IF EXISTS create_variance_report();

CREATE OR REPLACE FUNCTION create_variance_report()
RETURNS trigger AS $$
DECLARE
  v_product products%ROWTYPE;
  v_actual_units integer;
  v_expected_units integer;
  v_variance integer;
  v_variance_pct numeric;
BEGIN
  -- Only process if synced and has a matching product
  IF NEW.synced = true AND NEW.product_id IS NOT NULL THEN
    
    -- Get product details - match by barcode AND lot number
    SELECT * INTO v_product
    FROM products
    WHERE id = NEW.product_id
    AND (lot = NEW.extracted_lot_number OR lot = '' OR NEW.extracted_lot_number = '');

    IF FOUND THEN
      -- Convert actual count to units using pallet configuration
      v_actual_units := convert_to_units(
        v_product.barcode,
        NEW.actual_quantity,
        NEW.unit_type
      );

      -- Expected units come from stock_on_hand (already in units)
      v_expected_units := v_product.stock_on_hand;

      -- Calculate variance (positive = overage, negative = shortage)
      v_variance := v_actual_units - v_expected_units;

      -- Calculate percentage (avoid division by zero)
      IF v_expected_units > 0 THEN
        v_variance_pct := (v_variance::numeric / v_expected_units::numeric) * 100;
      ELSE
        v_variance_pct := 0;
      END IF;

      -- Create or update variance report
      INSERT INTO variance_reports (
        product_id,
        stocktake_entry_id,
        expected_quantity,
        actual_quantity,
        expected_units,
        actual_units,
        lot_number,
        variance,
        variance_percentage,
        status
      ) VALUES (
        NEW.product_id,
        NEW.id,
        v_expected_units,
        NEW.actual_quantity,
        v_expected_units,
        v_actual_units,
        NEW.extracted_lot_number,
        v_variance,
        v_variance_pct,
        'pending'
      )
      ON CONFLICT (stocktake_entry_id) 
      DO UPDATE SET
        expected_quantity = v_expected_units,
        actual_quantity = NEW.actual_quantity,
        expected_units = v_expected_units,
        actual_units = v_actual_units,
        lot_number = NEW.extracted_lot_number,
        variance = v_variance,
        variance_percentage = v_variance_pct,
        updated_at = now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create unique constraint on stocktake_entry_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'variance_reports_stocktake_entry_id_key'
  ) THEN
    ALTER TABLE variance_reports 
    ADD CONSTRAINT variance_reports_stocktake_entry_id_key 
    UNIQUE (stocktake_entry_id);
  END IF;
END $$;

-- Recreate trigger
CREATE TRIGGER create_variance_report_trigger
  AFTER INSERT OR UPDATE OF synced ON stocktake_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_variance_report();

-- Comment on columns
COMMENT ON COLUMN variance_reports.actual_units IS 'Actual quantity converted to units';
COMMENT ON COLUMN variance_reports.expected_units IS 'Expected quantity from stock_on_hand in units';
COMMENT ON COLUMN variance_reports.lot_number IS 'Lot number for matching counts';
COMMENT ON COLUMN variance_reports.variance IS 'Difference in units (actual - expected)';
