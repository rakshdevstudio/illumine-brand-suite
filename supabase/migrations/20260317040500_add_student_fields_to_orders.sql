alter table public.orders
  add column if not exists student_name text,
  add column if not exists grade text,
  add column if not exists alternate_phone text;