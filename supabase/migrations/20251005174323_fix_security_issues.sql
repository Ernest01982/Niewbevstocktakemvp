/*
  # Fix Security and Performance Issues

  1. Add Missing Indexes
    - Add index for variance_reports.reviewed_by foreign key
  
  2. Optimize RLS Policies
    - Replace auth.uid() with (select auth.uid()) to prevent re-evaluation per row
    - Consolidate multiple permissive policies
  
  3. Fix Function Search Paths
    - Set SECURITY DEFINER and search_path for all functions
  
  4. Performance
    - Note: "Unused" indexes are actually important for production use at scale
*/

-- 1. Add missing index for foreign key
CREATE INDEX IF NOT EXISTS idx_variance_reports_reviewed_by 
ON variance_reports(reviewed_by);

-- 2. Drop all existing RLS policies to recreate them optimized
-- user_profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON user_profiles;

-- Create consolidated and optimized user_profiles policies
CREATE POLICY "Users and admins can view profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = id 
    OR 
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = (select auth.uid())
      AND up.role = 'admin'
    )
  );

CREATE POLICY "Users and admins can update profiles"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = (select auth.uid())
      AND up.role = 'admin'
    )
  )
  WITH CHECK (
    (select auth.uid()) = id
    OR
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = (select auth.uid())
      AND up.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = (select auth.uid())
      AND role = 'admin'
    )
  );

-- products policies
DROP POLICY IF EXISTS "All users can view products" ON products;
DROP POLICY IF EXISTS "Managers and Admins can insert products" ON products;
DROP POLICY IF EXISTS "Managers and Admins can update products" ON products;
DROP POLICY IF EXISTS "Admins can delete products" ON products;

CREATE POLICY "All users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and Admins can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers and Admins can update products"
  ON products FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Admins can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role = 'admin'
    )
  );

-- stocktake_entries policies
DROP POLICY IF EXISTS "Users can view their own entries" ON stocktake_entries;
DROP POLICY IF EXISTS "Managers and Admins can view all entries" ON stocktake_entries;
DROP POLICY IF EXISTS "Authenticated users can insert entries" ON stocktake_entries;
DROP POLICY IF EXISTS "Users can update their own entries" ON stocktake_entries;
DROP POLICY IF EXISTS "Admins can delete entries" ON stocktake_entries;

CREATE POLICY "Users can view entries"
  ON stocktake_entries FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Authenticated users can insert entries"
  ON stocktake_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own entries"
  ON stocktake_entries FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Admins can delete entries"
  ON stocktake_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role = 'admin'
    )
  );

-- variance_reports policies
DROP POLICY IF EXISTS "Managers and Admins can view all reports" ON variance_reports;
DROP POLICY IF EXISTS "Managers and Admins can update reports" ON variance_reports;
DROP POLICY IF EXISTS "Admins can delete reports" ON variance_reports;

CREATE POLICY "Managers and Admins can view all reports"
  ON variance_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers and Admins can update reports"
  ON variance_reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Admins can delete reports"
  ON variance_reports FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role = 'admin'
    )
  );

-- bulk_uploads policies
DROP POLICY IF EXISTS "Users can view their own uploads" ON bulk_uploads;
DROP POLICY IF EXISTS "Managers and Admins can view all uploads" ON bulk_uploads;
DROP POLICY IF EXISTS "Authenticated users can create uploads" ON bulk_uploads;
DROP POLICY IF EXISTS "Users can update their own uploads" ON bulk_uploads;

CREATE POLICY "Users can view uploads"
  ON bulk_uploads FOR SELECT
  TO authenticated
  USING (
    user_id = (select auth.uid())
    OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Authenticated users can create uploads"
  ON bulk_uploads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update their own uploads"
  ON bulk_uploads FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- pallet_configurations policies
DROP POLICY IF EXISTS "All users can view pallet configurations" ON pallet_configurations;
DROP POLICY IF EXISTS "Managers and Admins can create pallet configurations" ON pallet_configurations;
DROP POLICY IF EXISTS "Managers and Admins can update pallet configurations" ON pallet_configurations;
DROP POLICY IF EXISTS "Managers and Admins can delete pallet configurations" ON pallet_configurations;

CREATE POLICY "All users can view pallet configurations"
  ON pallet_configurations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and Admins can create pallet configurations"
  ON pallet_configurations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers and Admins can update pallet configurations"
  ON pallet_configurations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers and Admins can delete pallet configurations"
  ON pallet_configurations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = (select auth.uid())
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

-- 3. Fix function search paths
-- Drop and recreate functions with proper security settings

-- handle_updated_at
DROP FUNCTION IF EXISTS public.handle_updated_at() CASCADE;
CREATE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate triggers
CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_stocktake_entries
  BEFORE UPDATE ON stocktake_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_variance_reports
  BEFORE UPDATE ON variance_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_bulk_uploads
  BEFORE UPDATE ON bulk_uploads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_pallet_configurations
  BEFORE UPDATE ON pallet_configurations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- handle_new_user
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
CREATE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'stocktaker'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- calculate_available_stock
DROP FUNCTION IF EXISTS public.calculate_available_stock() CASCADE;
CREATE FUNCTION public.calculate_available_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.available_stock := NEW.stock_on_hand - NEW.allocated_stock;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS calculate_available_stock_trigger ON products;
CREATE TRIGGER calculate_available_stock_trigger
  BEFORE INSERT OR UPDATE OF stock_on_hand, allocated_stock ON products
  FOR EACH ROW EXECUTE FUNCTION calculate_available_stock();

-- convert_to_units
DROP FUNCTION IF EXISTS public.convert_to_units(text, integer, text);
CREATE FUNCTION public.convert_to_units(
  p_barcode text,
  p_quantity integer,
  p_unit_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config pallet_configurations%ROWTYPE;
  v_units integer;
BEGIN
  SELECT * INTO v_config
  FROM pallet_configurations
  WHERE barcode = p_barcode;

  IF NOT FOUND THEN
    RETURN p_quantity;
  END IF;

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
$$;

-- create_variance_report
DROP FUNCTION IF EXISTS public.create_variance_report() CASCADE;
CREATE FUNCTION public.create_variance_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product products%ROWTYPE;
  v_actual_units integer;
  v_expected_units integer;
  v_variance integer;
  v_variance_pct numeric;
BEGIN
  IF NEW.synced = true AND NEW.product_id IS NOT NULL THEN
    
    SELECT * INTO v_product
    FROM products
    WHERE id = NEW.product_id
    AND (lot = NEW.extracted_lot_number OR lot = '' OR NEW.extracted_lot_number = '');

    IF FOUND THEN
      v_actual_units := convert_to_units(
        v_product.barcode,
        NEW.actual_quantity,
        NEW.unit_type
      );

      v_expected_units := v_product.stock_on_hand;
      v_variance := v_actual_units - v_expected_units;

      IF v_expected_units > 0 THEN
        v_variance_pct := (v_variance::numeric / v_expected_units::numeric) * 100;
      ELSE
        v_variance_pct := 0;
      END IF;

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
$$;

DROP TRIGGER IF EXISTS create_variance_report_trigger ON stocktake_entries;
CREATE TRIGGER create_variance_report_trigger
  AFTER INSERT OR UPDATE OF synced ON stocktake_entries
  FOR EACH ROW
  EXECUTE FUNCTION create_variance_report();

-- Fix generate_variance_report if it exists
DROP FUNCTION IF EXISTS public.generate_variance_report(uuid) CASCADE;

COMMENT ON FUNCTION public.handle_updated_at IS 'Updates the updated_at timestamp - SECURITY DEFINER with fixed search_path';
COMMENT ON FUNCTION public.handle_new_user IS 'Creates user profile on auth.users insert - SECURITY DEFINER with fixed search_path';
COMMENT ON FUNCTION public.calculate_available_stock IS 'Calculates available stock - SECURITY DEFINER with fixed search_path';
COMMENT ON FUNCTION public.convert_to_units IS 'Converts counts to units - SECURITY DEFINER with fixed search_path';
COMMENT ON FUNCTION public.create_variance_report IS 'Creates variance reports - SECURITY DEFINER with fixed search_path';
