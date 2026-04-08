-- Ensure product assignment duplicates are impossible at DB layer.
-- Unique scope: product + school + class + gender.

DELETE FROM public.product_assignments pa
USING public.product_assignments duplicate
WHERE pa.id > duplicate.id
  AND pa.product_id = duplicate.product_id
  AND pa.school_id = duplicate.school_id
  AND pa.class_id = duplicate.class_id
  AND pa.gender = duplicate.gender;

ALTER TABLE public.product_assignments
  DROP CONSTRAINT IF EXISTS product_assignments_unique_scope;

ALTER TABLE public.product_assignments
  ADD CONSTRAINT product_assignments_unique_scope UNIQUE (product_id, school_id, class_id, gender);

CREATE INDEX IF NOT EXISTS idx_product_assignments_scope
  ON public.product_assignments (school_id, class_id, gender, display_order);

CREATE INDEX IF NOT EXISTS idx_product_assignments_product_id
  ON public.product_assignments (product_id);
