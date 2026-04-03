-- Relax branch requirement so orders can move through lifecycle without branch_id.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_lifecycle_branch_required_check;
