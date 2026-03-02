
-- Create classes table
CREATE TABLE public.classes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL REFERENCES public.schools(id),
  name text NOT NULL,
  code text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- RLS policies (public read/write for now, matching existing pattern)
CREATE POLICY "Classes are viewable by everyone" ON public.classes FOR SELECT USING (true);
CREATE POLICY "Classes can be inserted by anyone" ON public.classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Classes can be updated by anyone" ON public.classes FOR UPDATE USING (true);

-- Add class_id to products (nullable so existing products aren't broken)
ALTER TABLE public.products ADD COLUMN class_id uuid REFERENCES public.classes(id);
