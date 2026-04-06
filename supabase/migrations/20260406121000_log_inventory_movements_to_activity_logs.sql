-- Emit admin activity logs for stock movements so inventory changes appear in the audit timeline.
-- This assumes the actor/profile hardening migration has already been applied.

create or replace function public.apply_inventory_movement(
  p_branch_id uuid,
  p_variant_id uuid,
  p_type text,
  p_quantity integer,
  p_reference_type text default 'SYSTEM',
  p_reference_id uuid default null,
  p_reason text default null,
  p_created_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_stock integer;
  delta integer;
  movement_id uuid;
  effective_created_by uuid;
  product_id uuid;
  product_name text;
  branch_name text;
  stock_action text;
begin
  if p_branch_id is null or p_variant_id is null then
    raise exception 'branch_id and variant_id are required';
  end if;

  if p_type not in ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER') then
    raise exception 'Invalid movement type';
  end if;

  if p_reference_type not in ('ORDER', 'MANUAL', 'SYSTEM') then
    raise exception 'Invalid reference type';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Quantity must be non-zero';
  end if;

  delta := case
    when p_type = 'IN' then abs(p_quantity)
    when p_type = 'OUT' then -abs(p_quantity)
    else p_quantity
  end;

  select pv.product_id, p.name
    into product_id, product_name
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  where pv.id = p_variant_id;

  select b.name
    into branch_name
  from public.branches b
  where b.id = p_branch_id;

  insert into public.branch_inventory (branch_id, product_id, variant_id, stock, updated_at)
  select p_branch_id, pv.product_id, pv.id, 0, now()
  from public.product_variants pv
  where pv.id = p_variant_id
  on conflict (branch_id, variant_id) do nothing;

  select bi.stock
    into current_stock
  from public.branch_inventory bi
  where bi.branch_id = p_branch_id
    and bi.variant_id = p_variant_id
  for update;

  if current_stock is null then
    raise exception 'branch_inventory row not found for branch % and variant %', p_branch_id, p_variant_id;
  end if;

  if current_stock + delta < 0 then
    raise exception 'Insufficient stock. before=%, delta=%', current_stock, delta;
  end if;

  perform set_config('app.inventory_movement', 'on', true);

  update public.branch_inventory
  set stock = current_stock + delta,
      updated_at = now()
  where branch_id = p_branch_id
    and variant_id = p_variant_id;

  effective_created_by := coalesce(auth.uid(), p_created_by);

  if effective_created_by is not null then
    perform public.ensure_profile_for_user(effective_created_by);
  end if;

  insert into public.inventory_movements (
    branch_id,
    variant_id,
    type,
    quantity,
    before_stock,
    after_stock,
    reference_type,
    reference_id,
    reason,
    created_by
  ) values (
    p_branch_id,
    p_variant_id,
    p_type,
    delta,
    current_stock,
    current_stock + delta,
    p_reference_type,
    p_reference_id,
    p_reason,
    effective_created_by
  )
  returning id into movement_id;

  stock_action := case
    when delta > 0 then 'STOCK_IN'
    when delta < 0 and p_type = 'OUT' then 'STOCK_OUT'
    else 'STOCK_ADJUSTED'
  end;

  if effective_created_by is not null then
    perform public.log_product_activity(
      stock_action,
      p_variant_id,
      'inventory',
      format(
        'Stock %s for %s / %s: %s -> %s (%s%s)',
        case when delta > 0 then 'increased' else 'decreased' end,
        coalesce(product_name, 'Product'),
        coalesce(branch_name, 'Branch'),
        current_stock,
        current_stock + delta,
        case when p_reason is not null and length(trim(p_reason)) > 0 then p_reason else 'no reason provided' end,
        case when p_reference_type is not null then format(', ref=%s', p_reference_type) else '' end
      ),
      effective_created_by
    );
  end if;

  return jsonb_build_object(
    'movement_id', movement_id,
    'before_stock', current_stock,
    'after_stock', current_stock + delta,
    'delta', delta
  );
end;
$$;
