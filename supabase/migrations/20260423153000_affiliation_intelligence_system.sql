-- Affiliation Intelligence System
-- School-wise commission configuration + invoice-backed revenue summary RPC.

CREATE TABLE IF NOT EXISTS public.school_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  commission_percentage numeric(5,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_affiliations_school_id_key UNIQUE (school_id),
  CONSTRAINT school_affiliations_commission_percentage_chk CHECK (commission_percentage >= 0 AND commission_percentage <= 100)
);

CREATE INDEX IF NOT EXISTS school_affiliations_school_id_idx
  ON public.school_affiliations (school_id);

DROP TRIGGER IF EXISTS trg_school_affiliations_updated_at ON public.school_affiliations;
CREATE TRIGGER trg_school_affiliations_updated_at
BEFORE UPDATE ON public.school_affiliations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.school_affiliations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'school_affiliations'
      AND policyname = 'Admins can read school affiliations'
  ) THEN
    CREATE POLICY "Admins can read school affiliations"
      ON public.school_affiliations
      FOR SELECT
      USING (
        public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'school_affiliations'
      AND policyname = 'Admins can insert school affiliations'
  ) THEN
    CREATE POLICY "Admins can insert school affiliations"
      ON public.school_affiliations
      FOR INSERT
      WITH CHECK (
        public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'school_affiliations'
      AND policyname = 'Admins can update school affiliations'
  ) THEN
    CREATE POLICY "Admins can update school affiliations"
      ON public.school_affiliations
      FOR UPDATE
      USING (
        public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'admin')
      )
      WITH CHECK (
        public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'admin')
      );
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE ON public.school_affiliations TO authenticated;
REVOKE ALL ON public.school_affiliations FROM anon;

CREATE OR REPLACE FUNCTION public.get_school_affiliation_summary(
  p_date_from date,
  p_date_to date,
  p_school_id uuid DEFAULT NULL
)
RETURNS TABLE (
  school_id uuid,
  revenue_incl numeric,
  revenue_excl numeric,
  gst numeric,
  order_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.school_id,
    ROUND(COALESCE(SUM(i.total), 0), 2) AS revenue_incl,
    ROUND(COALESCE(SUM(i.subtotal), 0), 2) AS revenue_excl,
    ROUND(COALESCE(SUM(COALESCE(i.cgst, 0) + COALESCE(i.sgst, 0)), 0), 2) AS gst,
    COUNT(DISTINCT i.order_id)::bigint AS order_count
  FROM public.invoices i
  JOIN public.orders o ON o.id = i.order_id
  WHERE i.status <> 'cancelled'
    AND i.created_at::date >= p_date_from
    AND i.created_at::date <= p_date_to
    AND (p_school_id IS NULL OR o.school_id = p_school_id)
  GROUP BY o.school_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_affiliation_summary(date, date, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_school_affiliation_summary(date, date, uuid) FROM anon;
