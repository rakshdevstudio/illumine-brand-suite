-- ============================================================
-- Add child school / class / gender to customers table
-- So parents can associate their account with their child's school
-- ============================================================

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS child_school_id UUID
    REFERENCES public.schools(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_class_id  UUID
    REFERENCES public.classes(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_gender    TEXT;

CREATE INDEX IF NOT EXISTS customers_child_school_id_idx
  ON public.customers(child_school_id);
