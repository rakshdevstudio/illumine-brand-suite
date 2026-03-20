-- Enterprise inventory movement system: stock changes are movement-driven and fully auditable.

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  type text not null check (type in ('IN', 'OUT', 'ADJUSTMENT', 'TRANSFER')),
  quantity integer not null check (quantity <> 0),
  before_stock integer not null check (before_stock >= 0),
  after_stock integer not null check (after_stock >= 0),
  reference_type text not null default 'SYSTEM' check (reference_type in ('ORDER', 'MANUAL', 'SYSTEM')),
  reference_id uuid,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists inventory_movements_branch_created_idx
  on public.inventory_movements (branch_id, created_at desc);

create index if not exists inventory_movements_variant_created_idx
  on public.inventory_movements (variant_id, created_at desc);

create index if not exists inventory_movements_reference_idx
  on public.inventory_movements (reference_type, reference_id);

alter table public.inventory_movements enable row level security;

drop policy if exists "inventory movements readable by authenticated" on public.inventory_movements;
create policy "inventory movements readable by authenticated"
  on public.inventory_movements
  for select
  to authenticated
  using (auth.uid() is not null);

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

  return jsonb_build_object(
    'movement_id', movement_id,
    'before_stock', current_stock,
    'after_stock', current_stock + delta,
    'delta', delta
  );
end;
$$;

revoke all on function public.apply_inventory_movement(uuid, uuid, text, integer, text, uuid, text, uuid) from public;
grant execute on function public.apply_inventory_movement(uuid, uuid, text, integer, text, uuid, text, uuid) to authenticated;

create or replace function public.prevent_direct_branch_inventory_stock_update()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.inventory_movement', true) is distinct from 'on' then
    raise exception 'Direct stock updates are disabled. Use apply_inventory_movement().';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_direct_branch_inventory_stock_update on public.branch_inventory;
create trigger trg_prevent_direct_branch_inventory_stock_update
before update of stock
on public.branch_inventory
for each row
execute function public.prevent_direct_branch_inventory_stock_update();
