-- Strict multi-tenant product layer

create table if not exists public.school_products (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric not null,
  custom_name text null,
  custom_image text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists school_products_school_product_unique
  on public.school_products (school_id, product_id);

create index if not exists school_products_school_id_idx on public.school_products (school_id);
create index if not exists school_products_product_id_idx on public.school_products (product_id);

create trigger trg_school_products_updated_at
before update on public.school_products
for each row
execute function public.handle_updated_at();

-- Optional RLS stub: lock rows to tenant
alter table public.school_products enable row level security;

create policy if not exists "tenant-read-school-products"
  on public.school_products for select
  using (school_id = current_setting('app.school_id', true)::uuid);

create policy if not exists "tenant-write-school-products"
  on public.school_products for all
  using (school_id = current_setting('app.school_id', true)::uuid)
  with check (school_id = current_setting('app.school_id', true)::uuid);
