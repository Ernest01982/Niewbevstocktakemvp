-- Enable RLS on the counts table
ALTER TABLE public.counts ENABLE ROW LEVEL SECURITY;

-- Policy for INSERT
CREATE POLICY "Enable insert for assigned warehouse and open event"
ON public.counts
FOR INSERT
WITH CHECK (
  (
    EXISTS (
      SELECT 1
      FROM public.user_warehouse_assignments uwa
      WHERE uwa.user_id = auth.uid() AND uwa.warehouse_code = counts.warehouse_code
    )
    AND
    EXISTS (
      SELECT 1
      FROM public.stocktake_events se
      WHERE se.id = counts.event_id AND se.status = 'open'
    )
  )
);

-- Policy for SELECT
CREATE POLICY "Enable select for assigned warehouse"
ON public.counts
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.user_warehouse_assignments uwa
    WHERE uwa.user_id = auth.uid() AND uwa.warehouse_code = counts.warehouse_code
  )
);

-- Helper function to get user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role
    FROM public.user_profiles
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on the products table
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT
CREATE POLICY "Enable select for all authenticated users"
ON public.products
FOR SELECT
USING (auth.role() = 'authenticated');

-- Policy for INSERT
CREATE POLICY "Enable insert for admins only"
ON public.products
FOR INSERT
WITH CHECK (get_user_role() = 'admin');

-- Policy for UPDATE
CREATE POLICY "Enable update for admins only"
ON public.products
FOR UPDATE
USING (get_user_role() = 'admin');

-- Policy for DELETE
CREATE POLICY "Enable delete for admins only"
ON public.products
FOR DELETE
USING (get_user_role() = 'admin');

-- Helper function to check if a user is a manager of a specific warehouse
CREATE OR REPLACE FUNCTION is_warehouse_manager(p_warehouse_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT EXISTS (
      SELECT 1
      FROM public.user_warehouse_assignments uwa
      JOIN public.user_profiles up ON uwa.user_id = up.user_id
      WHERE uwa.user_id = auth.uid()
        AND uwa.warehouse_code = p_warehouse_code
        AND up.role = 'manager'
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Enable RLS on the recount_tasks table
ALTER TABLE public.recount_tasks ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT
CREATE POLICY "Enable select for assigned user"
ON public.recount_tasks
FOR SELECT
USING (assigned_to = auth.uid());

-- Policy for INSERT
CREATE POLICY "Enable insert for managers and admins"
ON public.recount_tasks
FOR INSERT
WITH CHECK (get_user_role() IN ('manager', 'admin'));

-- Policy for UPDATE
CREATE POLICY "Enable update for assigned user"
ON public.recount_tasks
FOR UPDATE
USING (assigned_to = auth.uid());

-- Policy for DELETE
CREATE POLICY "Enable delete for admins only"
ON public.recount_tasks
FOR DELETE
USING (get_user_role() = 'admin');

-- Enable RLS on the user_warehouse_assignments table
ALTER TABLE public.user_warehouse_assignments ENABLE ROW LEVEL SECURITY;

-- Policy for SELECT
CREATE POLICY "Enable select for own assignments, or for managers/admins"
ON public.user_warehouse_assignments
FOR SELECT
USING (
  user_id = auth.uid()
  OR get_user_role() = 'admin'
  OR (get_user_role() = 'manager' AND is_warehouse_manager(warehouse_code))
);

-- Policy for INSERT
CREATE POLICY "Enable insert for managers and admins"
ON public.user_warehouse_assignments
FOR INSERT
WITH CHECK (
  get_user_role() = 'admin'
  OR (get_user_role() = 'manager' AND is_warehouse_manager(warehouse_code))
);

-- Policy for UPDATE
CREATE POLICY "Enable update for managers and admins"
ON public.user_warehouse_assignments
FOR UPDATE
USING (
  get_user_role() = 'admin'
  OR (get_user_role() = 'manager' AND is_warehouse_manager(warehouse_code))
);

-- Policy for DELETE
CREATE POLICY "Enable delete for managers and admins"
ON public.user_warehouse_assignments
FOR DELETE
USING (
  get_user_role() = 'admin'
  OR (get_user_role() = 'manager' AND is_warehouse_manager(warehouse_code))
);
