-- Hard guarantee for production: at least one active branch and seeded inventory.

insert into public.branches (name, location, is_active)
select 'Main Branch', 'Head Office', true
where not exists (
  select 1
  from public.branches
  where coalesce(is_active, true)
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
where coalesce(b.is_active, true)
  and not exists (
    select 1
    from public.branch_inventory bi
    where bi.branch_id = b.id
      and bi.variant_id = pv.id
  );
