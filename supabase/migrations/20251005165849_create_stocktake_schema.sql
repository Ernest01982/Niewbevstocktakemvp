/*
  # Smart Stocktake Application Database Schema

  ## Overview
  Complete database schema for warehouse stocktake application with role-based access control,
  product tracking, AI-extracted data, and variance reporting capabilities.

  ## 1. New Tables

  ### `user_profiles`
  Extends auth.users with role information and metadata
  - `id` (uuid, primary key) - Links to auth.users
  - `role` (text) - User role: 'stocktaker', 'manager', or 'admin'
  - `full_name` (text) - User's full name
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `products`
  Master product catalog with expected inventory
  - `id` (uuid, primary key)
  - `product_name` (text) - Product name
  - `barcode` (text, unique) - Product barcode/SKU
  - `pack_size` (text) - Package size information
  - `expected_quantity` (integer) - Expected stock quantity
  - `unit_type` (text) - Unit measurement (pallet, case, layer)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `stocktake_entries`
  Individual stocktake records captured by stocktakers
  - `id` (uuid, primary key)
  - `user_id` (uuid) - Stocktaker who created entry
  - `product_id` (uuid, nullable) - Link to products table if matched
  - `image_url` (text) - URL to uploaded product photo
  - `extracted_product_name` (text) - AI-extracted product name
  - `extracted_barcode` (text) - AI-extracted barcode
  - `extracted_lot_number` (text) - AI-extracted lot number
  - `extracted_pack_size` (text) - AI-extracted pack size
  - `actual_quantity` (integer) - Manually entered quantity
  - `unit_type` (text) - Unit type (pallet, case, layer)
  - `synced` (boolean) - Sync status for offline capability
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `variance_reports`
  Calculated variance between expected and actual stock
  - `id` (uuid, primary key)
  - `product_id` (uuid) - Product being reported
  - `stocktake_entry_id` (uuid) - Related stocktake entry
  - `expected_quantity` (integer) - Expected amount
  - `actual_quantity` (integer) - Counted amount
  - `variance` (integer) - Difference (actual - expected)
  - `variance_percentage` (numeric) - Percentage difference
  - `status` (text) - Report status (pending, reviewed, resolved)
  - `reviewed_by` (uuid, nullable) - Manager/Admin who reviewed
  - `notes` (text, nullable) - Review notes
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## 2. Security
  
  ### Row Level Security (RLS)
  All tables have RLS enabled with role-based policies:
  
  - **Stocktakers**: Can create stocktake entries and view their own data
  - **Managers**: Can view all stocktake entries and variance reports
  - **Admins**: Full access to all tables including user management

  ### Policies by Role
  - SELECT policies check user role from user_profiles table
  - INSERT policies restrict based on role capabilities
  - UPDATE/DELETE policies enforce ownership and role hierarchy
  - All policies require authentication via auth.uid()

  ## 3. Important Notes
  
  1. **Data Integrity**: Foreign keys ensure referential integrity
  2. **Offline Support**: synced column tracks upload status
  3. **Audit Trail**: All tables include created_at/updated_at timestamps
  4. **Role Hierarchy**: Admin > Manager > Stocktaker
  5. **Automatic Timestamps**: Updated using triggers
  6. **Variance Calculation**: Computed during report generation
*/

-- Create user_profiles table
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('stocktaker', 'manager', 'admin')) DEFAULT 'stocktaker',
  full_name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name text NOT NULL,
  barcode text UNIQUE NOT NULL,
  pack_size text DEFAULT '',
  expected_quantity integer DEFAULT 0,
  unit_type text NOT NULL CHECK (unit_type IN ('pallet', 'case', 'layer')) DEFAULT 'case',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create stocktake_entries table
CREATE TABLE IF NOT EXISTS stocktake_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  image_url text NOT NULL,
  extracted_product_name text DEFAULT '',
  extracted_barcode text DEFAULT '',
  extracted_lot_number text DEFAULT '',
  extracted_pack_size text DEFAULT '',
  actual_quantity integer NOT NULL,
  unit_type text NOT NULL CHECK (unit_type IN ('pallet', 'case', 'layer')) DEFAULT 'case',
  synced boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create variance_reports table
CREATE TABLE IF NOT EXISTS variance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stocktake_entry_id uuid NOT NULL REFERENCES stocktake_entries(id) ON DELETE CASCADE,
  expected_quantity integer NOT NULL,
  actual_quantity integer NOT NULL,
  variance integer NOT NULL,
  variance_percentage numeric(10,2) NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'reviewed', 'resolved')) DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(role);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_stocktake_entries_user_id ON stocktake_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_entries_product_id ON stocktake_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_entries_synced ON stocktake_entries(synced);
CREATE INDEX IF NOT EXISTS idx_variance_reports_status ON variance_reports(status);
CREATE INDEX IF NOT EXISTS idx_variance_reports_product_id ON variance_reports(product_id);

-- Enable Row Level Security
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE variance_reports ENABLE ROW LEVEL SECURITY;

-- User Profiles Policies
CREATE POLICY "Users can view their own profile"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can update their own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can insert profiles"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update any profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete profiles"
  ON user_profiles FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Products Policies
CREATE POLICY "All authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Managers and Admins can insert products"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Managers and Admins can update products"
  ON products FOR UPDATE
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

CREATE POLICY "Admins can delete products"
  ON products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Stocktake Entries Policies
CREATE POLICY "Users can view their own entries"
  ON stocktake_entries FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Managers and Admins can view all entries"
  ON stocktake_entries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "Authenticated users can insert entries"
  ON stocktake_entries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entries"
  ON stocktake_entries FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can delete entries"
  ON stocktake_entries FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Variance Reports Policies
CREATE POLICY "Managers and Admins can view all reports"
  ON variance_reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('manager', 'admin')
    )
  );

CREATE POLICY "System can insert variance reports"
  ON variance_reports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Managers and Admins can update reports"
  ON variance_reports FOR UPDATE
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

CREATE POLICY "Admins can delete reports"
  ON variance_reports FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, role)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE(new.raw_user_meta_data->>'role', 'stocktaker')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at_user_profiles ON user_profiles;
CREATE TRIGGER set_updated_at_user_profiles
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_products ON products;
CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_stocktake_entries ON stocktake_entries;
CREATE TRIGGER set_updated_at_stocktake_entries
  BEFORE UPDATE ON stocktake_entries
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_variance_reports ON variance_reports;
CREATE TRIGGER set_updated_at_variance_reports
  BEFORE UPDATE ON variance_reports
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to generate variance report when stocktake entry is synced
CREATE OR REPLACE FUNCTION public.generate_variance_report()
RETURNS trigger AS $$
DECLARE
  v_expected_qty integer;
  v_variance integer;
  v_variance_pct numeric;
BEGIN
  -- Only process if synced and has a product_id
  IF NEW.synced = true AND NEW.product_id IS NOT NULL THEN
    -- Get expected quantity from products
    SELECT expected_quantity INTO v_expected_qty
    FROM products
    WHERE id = NEW.product_id;
    
    IF v_expected_qty IS NOT NULL THEN
      -- Calculate variance
      v_variance := NEW.actual_quantity - v_expected_qty;
      
      -- Calculate percentage (avoid division by zero)
      IF v_expected_qty = 0 THEN
        v_variance_pct := 100;
      ELSE
        v_variance_pct := (v_variance::numeric / v_expected_qty::numeric) * 100;
      END IF;
      
      -- Insert or update variance report
      INSERT INTO variance_reports (
        product_id,
        stocktake_entry_id,
        expected_quantity,
        actual_quantity,
        variance,
        variance_percentage,
        status
      ) VALUES (
        NEW.product_id,
        NEW.id,
        v_expected_qty,
        NEW.actual_quantity,
        v_variance,
        v_variance_pct,
        'pending'
      )
      ON CONFLICT (stocktake_entry_id)
      DO UPDATE SET
        expected_quantity = v_expected_qty,
        actual_quantity = NEW.actual_quantity,
        variance = v_variance,
        variance_percentage = v_variance_pct,
        updated_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add unique constraint for stocktake_entry_id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'variance_reports_stocktake_entry_id_key'
  ) THEN
    ALTER TABLE variance_reports ADD CONSTRAINT variance_reports_stocktake_entry_id_key UNIQUE (stocktake_entry_id);
  END IF;
END $$;

-- Trigger to generate variance report
DROP TRIGGER IF EXISTS generate_variance_on_sync ON stocktake_entries;
CREATE TRIGGER generate_variance_on_sync
  AFTER INSERT OR UPDATE ON stocktake_entries
  FOR EACH ROW EXECUTE FUNCTION public.generate_variance_report();