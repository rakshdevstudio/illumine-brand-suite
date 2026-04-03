-- Create bridge table between schools and products (tenant catalog)
create table if not exists public.school_products (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric not null,
  custom_name text null,
  custom_image text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_products_school_product_unique unique (school_id, product_id)
);

create index if not exists idx_school_products_school_id on public.school_products (school_id);
create index if not exists idx_school_products_product_id on public.school_products (product_id);

-- Seed a single mapping if none exists, linking the earliest school + product
insert into public.school_products (school_id, product_id, price)
select s.id, p.id, coalesce(p.price, 0)
from public.schools s
cross join public.products p
order by s.created_at asc, p.created_at asc
limit 1
on conflict do nothing;
