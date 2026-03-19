-- Restrict branch_staff visibility and updates to their assigned branch.
-- Uses RESTRICTIVE policies so existing permissive admin/customer policies continue to work.

DROP POLICY IF EXISTS "Branch staff scoped orders" ON public.orders;
CREATE POLICY "Branch staff scoped orders"
ON public.orders
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) <> 'branch_staff'
  OR (
    branch_id IS NOT NULL
    AND branch_id = (
      SELECT p.branch_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  )
);

DROP POLICY IF EXISTS "Branch staff scoped order updates" ON public.orders;
CREATE POLICY "Branch staff scoped order updates"
ON public.orders
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.get_user_role(auth.uid()) <> 'branch_staff'
  OR (
    branch_id IS NOT NULL
    AND branch_id = (
      SELECT p.branch_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  )
)
WITH CHECK (
  public.get_user_role(auth.uid()) <> 'branch_staff'
  OR (
    branch_id IS NOT NULL
    AND branch_id = (
      SELECT p.branch_id
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
  )
);

DROP POLICY IF EXISTS "Branch staff scoped order items" ON public.order_items;
CREATE POLICY "Branch staff scoped order items"
ON public.order_items
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) <> 'branch_staff'
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = order_id
      AND o.branch_id = p.branch_id
  )
);

DROP POLICY IF EXISTS "Branch staff scoped order timeline" ON public.order_timeline;
CREATE POLICY "Branch staff scoped order timeline"
ON public.order_timeline
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) <> 'branch_staff'
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = order_id
      AND o.branch_id = p.branch_id
  )
);

DROP POLICY IF EXISTS "Branch staff scoped order notes" ON public.order_notes;
CREATE POLICY "Branch staff scoped order notes"
ON public.order_notes
AS RESTRICTIVE
FOR SELECT
TO authenticated
USING (
  public.get_user_role(auth.uid()) <> 'branch_staff'
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE o.id = order_id
      AND o.branch_id = p.branch_id
  )
);
