-- Synchronize Supabase schema with front-end expectations

-- Normalize user profile roles to match the front-end’s expectations
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.user_profiles'::regclass
    AND contype = 'c'
    AND conname LIKE 'user_profiles_role%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.user_profiles DROP CONSTRAINT %I', constraint_name);
  END IF;
END$$;

UPDATE public.user_profiles
SET role = 'stocktaker'
WHERE role IN ('stock_taker', 'stock-taker');

ALTER TABLE public.user_profiles
  ALTER COLUMN role SET DEFAULT 'stocktaker';

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('admin', 'manager', 'stocktaker'));

-- Add the barcode variants needed by the product lookup helpers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'case_barcode'
  ) THEN
    ALTER TABLE public.products ADD COLUMN case_barcode text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'unit_barcode'
  ) THEN
    ALTER TABLE public.products ADD COLUMN unit_barcode text;
  END IF;
END$$;

-- Remove duplicate case and unit barcodes before enforcing uniqueness
WITH duplicate_case_barcodes AS (
  SELECT case_barcode, MIN(id) AS keep_id
  FROM public.products
  WHERE case_barcode IS NOT NULL
  GROUP BY case_barcode
  HAVING COUNT(*) > 1
)
UPDATE public.products AS p
SET case_barcode = NULL
FROM duplicate_case_barcodes AS d
WHERE p.case_barcode = d.case_barcode
  AND p.id <> d.keep_id;

WITH duplicate_unit_barcodes AS (
  SELECT unit_barcode, MIN(id) AS keep_id
  FROM public.products
  WHERE unit_barcode IS NOT NULL
  GROUP BY unit_barcode
  HAVING COUNT(*) > 1
)
UPDATE public.products AS p
SET unit_barcode = NULL
FROM duplicate_unit_barcodes AS d
WHERE p.unit_barcode = d.unit_barcode
  AND p.id <> d.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_case_barcode
  ON public.products(case_barcode) WHERE case_barcode IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unit_barcode
  ON public.products(unit_barcode) WHERE unit_barcode IS NOT NULL;

-- Rebuild the product_pallet_view to expose packaging data alongside barcodes
CREATE OR REPLACE VIEW public.product_pallet_view AS
SELECT
  p.id AS product_id,
  p.stock_code,
  p.product_name,
  p.description,
  p.barcode AS default_barcode,
  COALESCE(p.case_barcode, pc.barcode) AS case_barcode,
  COALESCE(p.unit_barcode, p.barcode) AS unit_barcode,
  COALESCE(pc.units_per_case, p.units_per_case) AS units_per_case,
  COALESCE(pc.cases_per_layer, p.cases_per_layer) AS cases_per_layer,
  COALESCE(pc.layers_per_pallet, p.layers_per_pallet) AS layers_per_pallet,
  COALESCE(
    pc.units_per_pallet,
    COALESCE(pc.units_per_case, p.units_per_case)
      * COALESCE(pc.cases_per_layer, p.cases_per_layer)
      * COALESCE(pc.layers_per_pallet, p.layers_per_pallet)
  ) AS units_per_pallet,
  pc.id AS pallet_configuration_id,
  pc.created_at AS pallet_created_at,
  pc.updated_at AS pallet_updated_at
FROM public.products AS p
LEFT JOIN public.pallet_configurations AS pc
  ON pc.barcode = COALESCE(p.case_barcode, p.barcode);

-- Adopt the five-stage event lifecycle and keep counts restricted to “active” events
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.stocktake_events'::regclass
    AND contype = 'c'
    AND conname LIKE 'stocktake_events_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.stocktake_events DROP CONSTRAINT %I', constraint_name);
  END IF;
END$$;

UPDATE public.stocktake_events
SET status = CASE status
  WHEN 'open' THEN 'active'
  WHEN 'closed' THEN 'completed'
  ELSE status
END;

ALTER TABLE public.stocktake_events
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.stocktake_events
  ADD CONSTRAINT stocktake_events_status_check
  CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived'));

DROP POLICY IF EXISTS "Counts insert for assigned warehouses" ON public.counts;

CREATE POLICY "Counts insert for assigned warehouses"
  ON public.counts FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      EXISTS (
        SELECT 1 FROM public.user_profiles
        WHERE user_profiles.id = auth.uid()
          AND user_profiles.role = 'admin'
      )
      OR EXISTS (
        SELECT 1 FROM public.user_warehouse_assignments uwa
        WHERE uwa.user_id = auth.uid()
          AND uwa.warehouse_code = counts.warehouse_code
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.stocktake_events se
      WHERE se.id = counts.event_id
        AND se.status = 'active'
    )
  );

-- Extend recount_tasks with the metadata and status model used in the UI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recount_tasks' AND column_name = 'description'
  ) THEN
    ALTER TABLE public.recount_tasks ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recount_tasks' AND column_name = 'warehouse'
  ) THEN
    ALTER TABLE public.recount_tasks ADD COLUMN warehouse text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recount_tasks' AND column_name = 'location'
  ) THEN
    ALTER TABLE public.recount_tasks ADD COLUMN location text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recount_tasks' AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.recount_tasks ADD COLUMN completed_at timestamptz;
  END IF;
END$$;

DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.recount_tasks'::regclass
    AND contype = 'c'
    AND conname LIKE 'recount_tasks_status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.recount_tasks DROP CONSTRAINT %I', constraint_name);
  END IF;
END$$;

UPDATE public.recount_tasks
SET status = CASE status
  WHEN 'pending' THEN 'open'
  WHEN 'completed' THEN 'done'
  ELSE status
END;

UPDATE public.recount_tasks
SET completed_at = COALESCE(completed_at, updated_at)
WHERE status = 'done' AND completed_at IS NULL;

ALTER TABLE public.recount_tasks
  ADD CONSTRAINT recount_tasks_status_check
  CHECK (status IN ('open', 'done', 'cancelled'));

CREATE OR REPLACE FUNCTION public.normalize_recount_task_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    NEW.status := 'open';
  ELSIF NEW.status = 'completed' THEN
    NEW.status := 'done';
  END IF;

  IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := OLD.completed_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS normalize_recount_task_status ON public.recount_tasks;

CREATE TRIGGER normalize_recount_task_status
  BEFORE INSERT OR UPDATE ON public.recount_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_recount_task_status();

-- Surface bulk-upload metrics expected by the new dashboards while keeping the legacy columns in sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bulk_uploads' AND column_name = 'total_rows'
  ) THEN
    ALTER TABLE public.bulk_uploads ADD COLUMN total_rows integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bulk_uploads' AND column_name = 'inserted_rows'
  ) THEN
    ALTER TABLE public.bulk_uploads ADD COLUMN inserted_rows integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bulk_uploads' AND column_name = 'skipped_rows'
  ) THEN
    ALTER TABLE public.bulk_uploads ADD COLUMN skipped_rows integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bulk_uploads' AND column_name = 'finished_at'
  ) THEN
    ALTER TABLE public.bulk_uploads ADD COLUMN finished_at timestamptz;
  END IF;
END$$;

UPDATE public.bulk_uploads
SET total_rows = COALESCE(total_rows, records_total),
    inserted_rows = COALESCE(inserted_rows, records_success),
    skipped_rows = COALESCE(
      skipped_rows,
      GREATEST(
        COALESCE(records_total, 0)
        - COALESCE(records_success, 0)
        - COALESCE(records_failed, 0),
        0
      )
    ),
    finished_at = CASE
      WHEN finished_at IS NOT NULL THEN finished_at
      WHEN status IN ('completed', 'failed') THEN updated_at
      ELSE NULL
    END;

CREATE OR REPLACE FUNCTION public.sync_bulk_upload_metrics()
RETURNS trigger AS $$
DECLARE
  total integer;
  inserted integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.total_rows := COALESCE(NEW.total_rows, NEW.records_total, 0);
    NEW.records_total := NEW.total_rows;

    NEW.inserted_rows := COALESCE(NEW.inserted_rows, NEW.records_success, 0);
    NEW.records_success := NEW.inserted_rows;
  ELSE
    IF NEW.total_rows IS DISTINCT FROM OLD.total_rows THEN
      NEW.records_total := COALESCE(NEW.total_rows, 0);
    ELSIF NEW.records_total IS DISTINCT FROM OLD.records_total THEN
      NEW.total_rows := COALESCE(NEW.records_total, 0);
    ELSE
      NEW.total_rows := COALESCE(NEW.total_rows, NEW.records_total, 0);
      NEW.records_total := NEW.total_rows;
    END IF;

    IF NEW.inserted_rows IS DISTINCT FROM OLD.inserted_rows THEN
      NEW.records_success := COALESCE(NEW.inserted_rows, 0);
    ELSIF NEW.records_success IS DISTINCT FROM OLD.records_success THEN
      NEW.inserted_rows := COALESCE(NEW.records_success, 0);
    ELSE
      NEW.inserted_rows := COALESCE(NEW.inserted_rows, NEW.records_success, 0);
      NEW.records_success := NEW.inserted_rows;
    END IF;
  END IF;

  total := COALESCE(NEW.total_rows, NEW.records_total, 0);
  inserted := COALESCE(NEW.inserted_rows, NEW.records_success, 0);

  IF TG_OP = 'INSERT'
     OR NEW.skipped_rows IS NULL
     OR (TG_OP = 'UPDATE' AND (
          NEW.total_rows IS DISTINCT FROM OLD.total_rows OR
          NEW.records_total IS DISTINCT FROM OLD.records_total OR
          NEW.inserted_rows IS DISTINCT FROM OLD.inserted_rows OR
          NEW.records_success IS DISTINCT FROM OLD.records_success OR
          NEW.records_failed IS DISTINCT FROM OLD.records_failed))
  THEN
    NEW.skipped_rows := GREATEST(total - inserted - COALESCE(NEW.records_failed, 0), 0);
  END IF;

  IF NEW.status IN ('completed', 'failed') THEN
    IF NEW.finished_at IS NULL THEN
      NEW.finished_at := now();
    END IF;
  ELSE
    NEW.finished_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_bulk_upload_metrics ON public.bulk_uploads;

CREATE TRIGGER sync_bulk_upload_metrics
  BEFORE INSERT OR UPDATE ON public.bulk_uploads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_bulk_upload_metrics();
