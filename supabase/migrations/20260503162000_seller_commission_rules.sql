CREATE OR REPLACE FUNCTION public.is_illume_team_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('super_admin', 'admin', 'staff', 'branch_staff', 'illume_team')
  );
$$;

CREATE TABLE IF NOT EXISTS public.seller_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'seller', 'category')),
  seller_id uuid REFERENCES public.sellers(id) ON DELETE CASCADE,
  category text,
  commission_rate numeric(5,2) NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'global' AND seller_id IS NULL AND category IS NULL)
    OR (scope = 'seller' AND seller_id IS NOT NULL AND category IS NULL)
    OR (scope = 'category' AND category IS NOT NULL)
  )
);

ALTER TABLE public.seller_commission_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_commission_rules_admin_all ON public.seller_commission_rules;
CREATE POLICY seller_commission_rules_admin_all ON public.seller_commission_rules
FOR ALL TO authenticated
USING (public.is_illume_team_user())
WITH CHECK (public.is_illume_team_user());

CREATE INDEX IF NOT EXISTS seller_commission_rules_scope_idx ON public.seller_commission_rules(scope, is_active);
CREATE INDEX IF NOT EXISTS seller_commission_rules_seller_idx ON public.seller_commission_rules(seller_id, is_active);
CREATE INDEX IF NOT EXISTS seller_commission_rules_category_idx ON public.seller_commission_rules(category, is_active);
