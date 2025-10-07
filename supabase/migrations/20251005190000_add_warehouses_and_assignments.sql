-- Create warehouses table if it doesn't exist
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure trigger exists to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS warehouses_updated_at ON warehouses;
CREATE TRIGGER warehouses_updated_at
BEFORE UPDATE ON warehouses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Allow anyone with a session to read warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'warehouses'
      AND policyname = 'Allow authenticated read warehouses'
  ) THEN
    CREATE POLICY "Allow authenticated read warehouses"
      ON warehouses FOR SELECT
      TO authenticated
      USING (true);
  END IF;
END$$;

-- Create user_warehouse_assignments table
CREATE TABLE IF NOT EXISTS user_warehouse_assignments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  warehouse_code text NOT NULL REFERENCES warehouses(code) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, warehouse_code)
);

ALTER TABLE user_warehouse_assignments ENABLE ROW LEVEL SECURITY;

-- Policies for user_warehouse_assignments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_warehouse_assignments'
      AND policyname = 'Allow users to view their own warehouse assignments'
  ) THEN
    CREATE POLICY "Allow users to view their own warehouse assignments"
      ON user_warehouse_assignments FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_warehouse_assignments'
      AND policyname = 'Admins can manage all warehouse assignments'
  ) THEN
    CREATE POLICY "Admins can manage all warehouse assignments"
      ON user_warehouse_assignments FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM user_profiles
          WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
      );
  END IF;
END$$;
