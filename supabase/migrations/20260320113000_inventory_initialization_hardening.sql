-- Production hardening for branch/inventory initialization.
-- 1) Prevent duplicate branches by name+location.
-- 2) Ensure branch_inventory uniqueness per (branch_id, variant_id).
-- 3) Prevent deactivating/deleting the last active branch.
-- 4) Provide explicit admin-only initialize action via RPC.

create unique index if not exists branches_name_location_unique_idx
  on public.branches (lower(name), lower(location));

create unique index if not exists branch_inventory_branch_variant_unique_idx
  on public.branch_inventory (branch_id, variant_id);

create or replace function public.prevent_last_active_branch_removal()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if tg_op = 'DELETE' then
    if coalesce(old.is_active, true) then
      select count(*) into active_count
      from public.branches
      where coalesce(is_active, true);

      if active_count <= 1 then
        raise exception 'At least one active branch is required';
      end if;
    end if;

    return old;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_active, true) = true and coalesce(new.is_active, true) = false then
      select count(*) into active_count
      from public.branches
      where coalesce(is_active, true);

      if active_count <= 1 then
        raise exception 'At least one active branch is required';
      end if;
    end if;

    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_prevent_last_active_branch_removal on public.branches;
create trigger trg_prevent_last_active_branch_removal
before update of is_active or delete
on public.branches
for each row
execute function public.prevent_last_active_branch_removal();

create or replace function public.initialize_branch_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  current_role text;
  active_branch_count integer := 0;
  variant_count integer := 0;
  inserted_count integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select p.role
    into current_role
  from public.profiles p
  where p.user_id = current_user_id;

  if current_role not in ('admin', 'super_admin') then
    raise exception 'Only admins can initialize branch inventory';
  end if;

  insert into public.branches (name, location, is_active)
  select 'Main Branch', 'Head Office', true
  where not exists (
    select 1
    from public.branches
    where coalesce(is_active, true)
  );

  select count(*) into active_branch_count
  from public.branches
  where coalesce(is_active, true);

  select count(*) into variant_count
  from public.product_variants;

  with inserted as (
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
      )
    returning 1
  )
  select count(*) into inserted_count from inserted;

  return jsonb_build_object(
    'status', 'ok',
    'activeBranches', active_branch_count,
    'variants', variant_count,
    'rowsInserted', inserted_count
  );
end;
$$;

revoke all on function public.initialize_branch_inventory() from public;
grant execute on function public.initialize_branch_inventory() to authenticated;
