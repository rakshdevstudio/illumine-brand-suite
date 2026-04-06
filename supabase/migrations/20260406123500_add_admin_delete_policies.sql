-- Ensure admin/super_admin users can perform DELETE operations on admin-managed entities.
-- Without DELETE policies under RLS, deletes may no-op (0 rows affected) with no explicit error.

DROP POLICY IF EXISTS "Products can be deleted by admins" ON public.products;
CREATE POLICY "Products can be deleted by admins"
ON public.products
FOR DELETE
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Variants can be deleted by admins" ON public.product_variants;
CREATE POLICY "Variants can be deleted by admins"
ON public.product_variants
FOR DELETE
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Classes can be deleted by admins" ON public.classes;
CREATE POLICY "Classes can be deleted by admins"
ON public.classes
FOR DELETE
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Schools can be deleted by admins" ON public.schools;
CREATE POLICY "Schools can be deleted by admins"
ON public.schools
FOR DELETE
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'admin')
);
