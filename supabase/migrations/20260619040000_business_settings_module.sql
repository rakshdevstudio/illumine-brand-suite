-- Phase 2: Business Settings Module

CREATE TABLE IF NOT EXISTS public.business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL DEFAULT 'Illume Uniforms Pvt. Ltd.',
  company_gstin text NOT NULL DEFAULT '29ABCDE1234F1Z5',
  company_address text NOT NULL DEFAULT 'Income Tax Layout, 273, 5th Cross Rd, 8 Block, Govindaraja Nagar Ward, Naagarabhaavi, Bengaluru, Karnataka 560072',
  company_phone text,
  company_email text,
  invoice_prefix text NOT NULL DEFAULT 'INV-',
  invoice_terms text,
  invoice_footer text,
  default_gst_rate numeric(5,2) NOT NULL DEFAULT 5.00,
  barcode_width_mm numeric(5,2) NOT NULL DEFAULT 60.00,
  barcode_height_mm numeric(5,2) NOT NULL DEFAULT 40.00,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Singleton constraint
CREATE UNIQUE INDEX business_settings_single_row_idx ON public.business_settings ((1));

-- Insert default row
INSERT INTO public.business_settings (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS company_name text,
ADD COLUMN IF NOT EXISTS company_gstin text,
ADD COLUMN IF NOT EXISTS company_address text,
ADD COLUMN IF NOT EXISTS company_phone text,
ADD COLUMN IF NOT EXISTS company_email text;

-- Backfill existing invoices with hardcoded values to preserve snapshot
ALTER TABLE public.invoices DISABLE TRIGGER USER;
UPDATE public.invoices
SET company_name = 'Illume Uniforms Pvt. Ltd.',
    company_gstin = '29ABCDE1234F1Z5',
    company_address = 'Income Tax Layout, 273, 5th Cross Rd, 8 Block, Govindaraja Nagar Ward, Naagarabhaavi, Bengaluru, Karnataka 560072'
WHERE company_name IS NULL;
ALTER TABLE public.invoices ENABLE TRIGGER USER;

-- Create trigger to snapshot settings onto new invoices
CREATE OR REPLACE FUNCTION public.snapshot_business_settings_for_invoice()
RETURNS trigger AS $$
DECLARE
  v_settings public.business_settings;
BEGIN
  SELECT * INTO v_settings FROM public.business_settings LIMIT 1;
  IF FOUND THEN
    NEW.company_name := COALESCE(NEW.company_name, v_settings.company_name);
    NEW.company_gstin := COALESCE(NEW.company_gstin, v_settings.company_gstin);
    NEW.company_address := COALESCE(NEW.company_address, v_settings.company_address);
    NEW.company_phone := COALESCE(NEW.company_phone, v_settings.company_phone);
    NEW.company_email := COALESCE(NEW.company_email, v_settings.company_email);
    
    IF NEW.invoice_number LIKE 'INV-%' AND v_settings.invoice_prefix <> 'INV-' THEN
       NEW.invoice_number := replace(NEW.invoice_number, 'INV-', v_settings.invoice_prefix);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_snapshot_invoice_settings ON public.invoices;
CREATE TRIGGER trg_snapshot_invoice_settings
BEFORE INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.snapshot_business_settings_for_invoice();

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business settings viewable by everyone" ON public.business_settings;
CREATE POLICY "Business settings viewable by everyone" ON public.business_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Business settings manageable by admins" ON public.business_settings;
CREATE POLICY "Business settings manageable by admins" ON public.business_settings FOR ALL USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
