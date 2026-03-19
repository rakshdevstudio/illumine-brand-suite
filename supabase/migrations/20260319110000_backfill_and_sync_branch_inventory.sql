-- Backfill missing branch inventory rows and keep branch_inventory in sync
-- for newly created variants/branches.

insert into public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
select
  b.id as branch_id,
  pv.product_id,
  pv.id as variant_id,
  greatest(coalesce(pv.stock, 0), 0) as stock,
  now() as updated_at
from public.branches b
cross join public.product_variants pv
where coalesce(b.is_active, true)
  and not exists (
    select 1
    from public.branch_inventory bi
    where bi.branch_id = b.id
      and bi.variant_id = pv.id
  );

create or replace function public.sync_branch_inventory_for_new_variant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
  select
    b.id,
    new.product_id,
    new.id,
    greatest(coalesce(new.stock, 0), 0),
    now()
  from public.branches b
  where coalesce(b.is_active, true)
    and not exists (
      select 1
      from public.branch_inventory bi
      where bi.branch_id = b.id
        and bi.variant_id = new.id
    );

  return new;
end;
$$;

drop trigger if exists trg_sync_branch_inventory_new_variant on public.product_variants;
create trigger trg_sync_branch_inventory_new_variant
after insert on public.product_variants
for each row
execute function public.sync_branch_inventory_for_new_variant();

create or replace function public.sync_branch_inventory_for_new_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_active, true) then
    insert into public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
    select
      new.id,
      pv.product_id,
      pv.id,
      greatest(coalesce(pv.stock, 0), 0),
      now()
    from public.product_variants pv
    where not exists (
      select 1
      from public.branch_inventory bi
      where bi.branch_id = new.id
        and bi.variant_id = pv.id
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_branch_inventory_new_branch on public.branches;
create trigger trg_sync_branch_inventory_new_branch
after insert on public.branches
for each row
execute function public.sync_branch_inventory_for_new_branch();
