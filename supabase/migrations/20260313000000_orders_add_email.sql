-- Add email column to orders table for order confirmation emails
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email TEXT;
