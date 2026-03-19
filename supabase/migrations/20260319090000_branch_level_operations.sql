create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists branches_name_location_unique_idx
  on public.branches (lower(name), lower(location));

create table if not exists public.branch_inventory (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  stock integer not null default 0 check (stock >= 0),
  updated_at timestamptz not null default now()
);

create unique index if not exists branch_inventory_unique_variant_per_branch_idx
  on public.branch_inventory (branch_id, variant_id);

create index if not exists branch_inventory_branch_idx
  on public.branch_inventory (branch_id);

create index if not exists branch_inventory_variant_idx
  on public.branch_inventory (variant_id);

alter table public.orders
  add column if not exists branch_id uuid references public.branches(id),
  add column if not exists dispatch_status text not null default 'pending';

alter table public.orders
  drop constraint if exists orders_dispatch_status_check;

alter table public.orders
  add constraint orders_dispatch_status_check
  check (dispatch_status in ('pending', 'assigned', 'packed', 'dispatched', 'delivered'));

create index if not exists orders_branch_id_idx
  on public.orders (branch_id);

create index if not exists orders_dispatch_status_idx
  on public.orders (dispatch_status);

alter table public.profiles
  add column if not exists branch_id uuid references public.branches(id);

create index if not exists profiles_branch_id_idx
  on public.profiles (branch_id);

insert into public.branches (name, location, is_active)
select 'Main Branch', 'Head Office', true
where not exists (
  select 1 from public.branches where lower(name) = 'main branch' and lower(location) = 'head office'
);

insert into public.branch_inventory (branch_id, product_id, variant_id, stock)
select b.id, pv.product_id, pv.id, greatest(coalesce(pv.stock, 0), 0)
from public.product_variants pv
cross join lateral (
  select id
  from public.branches
  where lower(name) = 'main branch' and lower(location) = 'head office'
  limit 1
) b
where not exists (
  select 1
  from public.branch_inventory bi
  where bi.branch_id = b.id
    and bi.variant_id = pv.id
);

update public.orders o
set branch_id = b.id,
    dispatch_status = coalesce(nullif(o.dispatch_status, ''), 'pending')
from lateral (
  select id
  from public.branches
  where lower(name) = 'main branch' and lower(location) = 'head office'
  limit 1
) b
where o.branch_id is null;
