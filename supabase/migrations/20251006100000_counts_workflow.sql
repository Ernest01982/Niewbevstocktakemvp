/*
  # Counts Workflow Foundations

  - Align user roles with new enum values (admin, manager, stock_taker)
  - Ensure products carry stock_code and packaging snapshot fields
  - Create stocktake events, counts capture, and recount task tables
  - Configure RLS policies for counts, recount tasks, products, and assignments
  - Provision private storage bucket for count images
  - Create analytics materialized view, manager-facing view, and export RPC
  - Seed baseline data (warehouses + open event)
*/

-- Make sure user_profiles role constraint matches the new role values
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.user_profiles'::regclass
    AND contype = 'c'
    AND conname LIKE 'user_profiles_role_%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE user_profiles DROP CONSTRAINT %I', constraint_name);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'role'
  ) THEN
    EXECUTE $$ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_role_check
      CHECK (role IN ('admin', 'manager', 'stock_taker'))$$;
  END IF;
END$$;

-- Update legacy role values
UPDATE user_profiles SET role = 'stock_taker' WHERE role IN ('stocktaker', 'stock-taker');

-- Ensure products contain stock_code + packaging snapshot fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'stock_code'
  ) THEN
    ALTER TABLE products ADD COLUMN stock_code text;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_products_stock_code ON products(stock_code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'description'
  ) THEN
    ALTER TABLE products ADD COLUMN description text DEFAULT '';
    UPDATE products SET description = COALESCE(description, product_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'units_per_case'
  ) THEN
    ALTER TABLE products ADD COLUMN units_per_case integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'cases_per_layer'
  ) THEN
    ALTER TABLE products ADD COLUMN cases_per_layer integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'layers_per_pallet'
  ) THEN
    ALTER TABLE products ADD COLUMN layers_per_pallet integer DEFAULT 1;
  END IF;
END$$;

-- Backfill description when empty
UPDATE products
SET description = product_name
WHERE (description IS NULL OR length(trim(description)) = 0)
  AND product_name IS NOT NULL;

-- Warehouses seed list
INSERT INTO warehouses (code, name)
SELECT code, concat('Warehouse ', code)
FROM (
  VALUES ('100'), ('200'), ('003'), ('400'), ('500'), ('600'), ('700'), ('900'), ('1000'), ('1300')
) AS seeds(code)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- Stocktake events table
CREATE TABLE IF NOT EXISTS stocktake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS stocktake_events_updated_at ON stocktake_events;
CREATE TRIGGER stocktake_events_updated_at
  BEFORE UPDATE ON stocktake_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE stocktake_events ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read events they are scoped to via assignments; admins manage all
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stocktake_events' AND policyname = 'Admins manage stocktake events'
  ) THEN
    CREATE POLICY "Admins manage stocktake events"
      ON stocktake_events FOR ALL
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'stocktake_events' AND policyname = 'Users read stocktake events'
  ) THEN
    CREATE POLICY "Users read stocktake events"
      ON stocktake_events FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM user_warehouse_assignments uwa
          WHERE uwa.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
      );
  END IF;
END$$;

-- Counts table capturing submissions
CREATE TABLE IF NOT EXISTS counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES stocktake_events(id) ON DELETE CASCADE,
  warehouse_code text NOT NULL REFERENCES warehouses(code) ON DELETE RESTRICT,
  stock_code text NOT NULL,
  product_description text DEFAULT '',
  lot_number text,
  counted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracted', 'error')),
  singles_units integer DEFAULT 0,
  singles_cases integer DEFAULT 0,
  pick_face_layers integer DEFAULT 0,
  pick_face_cases integer DEFAULT 0,
  bulk_pallets integer DEFAULT 0,
  bulk_layers integer DEFAULT 0,
  bulk_cases integer DEFAULT 0,
  total_units bigint NOT NULL DEFAULT 0,
  units_per_case_snapshot integer DEFAULT 1,
  cases_per_layer_snapshot integer DEFAULT 1,
  layers_per_pallet_snapshot integer DEFAULT 1,
  pack_size_snapshot text DEFAULT '',
  photo_path text,
  extracted_barcode text,
  extracted_product_name text,
  extracted_pack_size text,
  extracted_lot_number text,
  extracted_filling_date date,
  extraction_log jsonb,
  extracted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_counts_event_warehouse ON counts(event_id, warehouse_code);
CREATE INDEX IF NOT EXISTS idx_counts_status ON counts(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_counts_photo_pending ON counts(status, photo_path) WHERE photo_path IS NOT NULL;

DROP TRIGGER IF EXISTS counts_updated_at ON counts;
CREATE TRIGGER counts_updated_at
  BEFORE UPDATE ON counts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE counts ENABLE ROW LEVEL SECURITY;

-- Recount tasks table
CREATE TABLE IF NOT EXISTS recount_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES stocktake_events(id) ON DELETE CASCADE,
  warehouse_code text NOT NULL REFERENCES warehouses(code) ON DELETE RESTRICT,
  stock_code text NOT NULL,
  lot_number text,
  assigned_to uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS recount_tasks_updated_at ON recount_tasks;
CREATE TRIGGER recount_tasks_updated_at
  BEFORE UPDATE ON recount_tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE recount_tasks ENABLE ROW LEVEL SECURITY;

-- RLS for counts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'counts' AND policyname = 'Counts insert for assigned warehouses'
  ) THEN
    CREATE POLICY "Counts insert for assigned warehouses"
      ON counts FOR INSERT
      TO authenticated
      WITH CHECK (
        (
          EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
              AND user_profiles.role = 'admin'
          )
          OR EXISTS (
            SELECT 1 FROM user_warehouse_assignments uwa
            WHERE uwa.user_id = auth.uid()
              AND uwa.warehouse_code = counts.warehouse_code
          )
        )
        AND EXISTS (
          SELECT 1 FROM stocktake_events se
          WHERE se.id = counts.event_id
            AND se.status = 'open'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'counts' AND policyname = 'Counts select for assigned warehouses'
  ) THEN
    CREATE POLICY "Counts select for assigned warehouses"
      ON counts FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
        OR EXISTS (
          SELECT 1 FROM user_warehouse_assignments uwa
          WHERE uwa.user_id = auth.uid()
            AND uwa.warehouse_code = counts.warehouse_code
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'counts' AND policyname = 'Service role manages counts'
  ) THEN
    CREATE POLICY "Service role manages counts"
      ON counts FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- RLS for recount tasks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recount_tasks' AND policyname = 'Recount tasks insert by managers'
  ) THEN
    CREATE POLICY "Recount tasks insert by managers"
      ON recount_tasks FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role IN ('admin', 'manager')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recount_tasks' AND policyname = 'Recount tasks select by assignee'
  ) THEN
    CREATE POLICY "Recount tasks select by assignee"
      ON recount_tasks FOR SELECT
      TO authenticated
      USING (assigned_to = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recount_tasks' AND policyname = 'Recount tasks update by assignee'
  ) THEN
    CREATE POLICY "Recount tasks update by assignee"
      ON recount_tasks FOR UPDATE
      TO authenticated
      USING (assigned_to = auth.uid())
      WITH CHECK (assigned_to = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recount_tasks' AND policyname = 'Service role manages recount tasks'
  ) THEN
    CREATE POLICY "Service role manages recount tasks"
      ON recount_tasks FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- User warehouse assignments read policy for managers and admins
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_warehouse_assignments'
      AND policyname = 'Managers read warehouse assignments'
  ) THEN
    CREATE POLICY "Managers read warehouse assignments"
      ON user_warehouse_assignments FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role IN ('admin', 'manager')
        )
      );
  END IF;
END$$;

-- Products policy adjustments (read for all authenticated, write admin only)
DO $$
BEGIN
  PERFORM 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products';
  IF FOUND THEN
    DROP POLICY IF EXISTS "All users can view products" ON products;
    DROP POLICY IF EXISTS "Managers and Admins can insert products" ON products;
    DROP POLICY IF EXISTS "Managers and Admins can update products" ON products;
    DROP POLICY IF EXISTS "Admins can delete products" ON products;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Products read for authenticated'
  ) THEN
    CREATE POLICY "Products read for authenticated"
      ON products FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Products admin manage'
  ) THEN
    CREATE POLICY "Products admin manage"
      ON products FOR ALL
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Service role manages products'
  ) THEN
    CREATE POLICY "Service role manages products"
      ON products FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- Create materialized view aggregating counts
CREATE MATERIALIZED VIEW IF NOT EXISTS counts_totals_mv AS
SELECT
  c.event_id,
  c.warehouse_code,
  c.stock_code,
  COALESCE(NULLIF(c.lot_number, ''), 'UNSPECIFIED') AS lot_number,
  max(COALESCE(NULLIF(c.product_description, ''), p.description, p.product_name, c.stock_code)) AS product_description,
  sum(c.total_units) AS counted_units,
  max(p.expected_quantity) AS expected_units
FROM counts c
LEFT JOIN products p
  ON (
    (p.stock_code IS NOT NULL AND p.stock_code = c.stock_code)
    OR (p.barcode IS NOT NULL AND p.barcode = c.stock_code)
  )
GROUP BY c.event_id, c.warehouse_code, c.stock_code, COALESCE(NULLIF(c.lot_number, ''), 'UNSPECIFIED');

CREATE UNIQUE INDEX IF NOT EXISTS idx_counts_totals_mv_key
  ON counts_totals_mv (event_id, warehouse_code, stock_code, lot_number);

-- Manager-facing view with limited columns
CREATE OR REPLACE VIEW manager_variance_view AS
SELECT
  mv.event_id,
  mv.warehouse_code,
  mv.stock_code,
  mv.product_description AS description,
  NULLIF(mv.lot_number, 'UNSPECIFIED') AS lot_number,
  (mv.counted_units - COALESCE(mv.expected_units, 0)) AS variance_units
FROM counts_totals_mv mv;

-- RPC for exporting counts
CREATE OR REPLACE FUNCTION export_counts_data(p_event_id uuid, p_warehouse_code text)
RETURNS TABLE (
  stock_code text,
  description text,
  lot_number text,
  counted_units bigint
) AS $$
  SELECT
    mv.stock_code,
    mv.product_description,
    NULLIF(mv.lot_number, 'UNSPECIFIED') AS lot_number,
    mv.counted_units
  FROM counts_totals_mv mv
  WHERE mv.event_id = p_event_id
    AND mv.warehouse_code = p_warehouse_code
  ORDER BY mv.stock_code, mv.lot_number;
$$ LANGUAGE sql STABLE;

-- Helper to refresh the materialized view concurrently
CREATE OR REPLACE FUNCTION refresh_counts_totals_mv()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY counts_totals_mv;
END;
$$;

COMMENT ON FUNCTION refresh_counts_totals_mv IS 'Refreshes the counts_totals_mv materialized view concurrently';

-- Ensure there is at least one open event
INSERT INTO stocktake_events (name, status)
SELECT 'Default Open Event', 'open'
WHERE NOT EXISTS (
  SELECT 1 FROM stocktake_events WHERE status = 'open'
);

-- Storage bucket for count images
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('count-images', 'count-images', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
END$$;

-- Storage policies for count images
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated upload count images'
  ) THEN
    CREATE POLICY "Authenticated upload count images"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'count-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Service role manage count images'
  ) THEN
    CREATE POLICY "Service role manage count images"
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'count-images')
      WITH CHECK (bucket_id = 'count-images');
  END IF;
END$$;
