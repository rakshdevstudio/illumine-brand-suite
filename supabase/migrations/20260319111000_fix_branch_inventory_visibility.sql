-- Ensure branch inventory is visible to authenticated admin UI users
-- and guarantee baseline rows exist.

insert into public.branches (name, location, is_active)
select 'Main Branch', 'Head Office', true
where not exists (
  select 1
  from public.branches
);

insert into public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
select
  b.id,
  pv.product_id,
  pv.id,
  greatest(coalesce(pv.stock, 0), 0),
  now()
from public.branches b
cross join public.product_variants pv
where not exists (
  select 1
  from public.branch_inventory bi
  where bi.branch_id = b.id
    and bi.variant_id = pv.id
);

alter table public.branch_inventory enable row level security;

drop policy if exists "Branch inventory readable by authenticated" on public.branch_inventory;
create policy "Branch inventory readable by authenticated"
on public.branch_inventory
for select
to authenticated
using (true);

drop policy if exists "Branch inventory writable by admins and staff" on public.branch_inventory;
create policy "Branch inventory writable by admins and staff"
on public.branch_inventory
for all
to authenticated
using (
  public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'staff')
)
with check (
  public.has_role(auth.uid(), 'super_admin')
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'staff')
);
