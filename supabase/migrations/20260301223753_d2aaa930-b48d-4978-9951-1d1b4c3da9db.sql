
-- Add code and status to schools
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add status to products  
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add price_override and status to product_variants
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS price_override numeric;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Allow admin to manage schools (insert, update)
CREATE POLICY "Schools can be inserted by anyone" ON public.schools FOR INSERT WITH CHECK (true);
CREATE POLICY "Schools can be updated by anyone" ON public.schools FOR UPDATE USING (true);
