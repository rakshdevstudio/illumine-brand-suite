-- Fix initialize_branch_inventory role lookup against current auth schema.
-- profiles no longer contains role/user_id; roles are in user_roles via has_role/get_user_role helpers.

create or replace function public.initialize_branch_inventory()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  active_branch_count integer := 0;
  variant_count integer := 0;
  inserted_count integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not (
    public.has_role(current_user_id, 'admin')
    or public.has_role(current_user_id, 'super_admin')
  ) then
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
