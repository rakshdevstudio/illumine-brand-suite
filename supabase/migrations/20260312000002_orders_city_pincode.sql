-- Add city and pincode columns to orders for guest checkout
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS city    TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT;
