-- Enrich inventory report view with product context required for auditing.
-- Adds: school, class, gender to each rollup row while preserving movement metrics.

drop view if exists public.inventory_report_view;

create view public.inventory_report_view as
with daily_inventory_rollup as (
  select
    timezone('Asia/Kolkata', im.created_at)::date as movement_date,
    im.branch_id,
    b.name as branch_name,
    im.variant_id,
    pv.product_id,
    p.name as product_name,
    p.school_id,
    s.name as school_name,
    p.class_id,
    c.name as class_name,
    p.gender,
    coalesce(nullif(trim(pv.size), ''), 'Default') as variant_size,
    min(im.before_stock)::integer as opening_stock,
    sum(
      case
        when im.type in ('IN', 'TRANSFER') and im.quantity > 0 then im.quantity
        else 0
      end
    )::integer as stock_in,
    sum(
      case
        when im.type in ('OUT', 'TRANSFER') and im.quantity < 0 then abs(im.quantity)
        else 0
      end
    )::integer as stock_out,
    sum(
      case
        when im.type = 'ADJUSTMENT' then im.quantity
        else 0
      end
    )::integer as adjustments,
    max(im.after_stock)::integer as closing_stock,
    bool_or(im.before_stock < 0 or im.after_stock < 0) as negative_stock_detected,
    count(*)::integer as movement_count,
    min(im.created_at) as first_movement_at,
    max(im.created_at) as last_movement_at
  from public.inventory_movements im
  join public.branches b
    on b.id = im.branch_id
  join public.product_variants pv
    on pv.id = im.variant_id
  join public.products p
    on p.id = pv.product_id
  left join public.schools s
    on s.id = p.school_id
  left join public.classes c
    on c.id = p.class_id
  group by
    timezone('Asia/Kolkata', im.created_at)::date,
    im.branch_id,
    b.name,
    im.variant_id,
    pv.product_id,
    p.name,
    p.school_id,
    s.name,
    p.class_id,
    c.name,
    p.gender,
    coalesce(nullif(trim(pv.size), ''), 'Default')
)
select
  daily_inventory_rollup.movement_date,
  daily_inventory_rollup.branch_id,
  daily_inventory_rollup.branch_name,
  daily_inventory_rollup.variant_id,
  daily_inventory_rollup.product_id,
  daily_inventory_rollup.product_name,
  daily_inventory_rollup.school_id,
  daily_inventory_rollup.school_name,
  daily_inventory_rollup.class_id,
  daily_inventory_rollup.class_name,
  daily_inventory_rollup.gender,
  daily_inventory_rollup.variant_size,
  daily_inventory_rollup.opening_stock,
  daily_inventory_rollup.stock_in,
  daily_inventory_rollup.stock_out,
  daily_inventory_rollup.adjustments,
  daily_inventory_rollup.closing_stock,
  coalesce(bi.stock, daily_inventory_rollup.closing_stock)::integer as current_stock,
  (
    daily_inventory_rollup.negative_stock_detected
    or coalesce(bi.stock, daily_inventory_rollup.closing_stock) < 0
  ) as negative_stock_detected,
  daily_inventory_rollup.movement_count,
  daily_inventory_rollup.first_movement_at,
  daily_inventory_rollup.last_movement_at
from daily_inventory_rollup
left join public.branch_inventory bi
  on bi.branch_id = daily_inventory_rollup.branch_id
 and bi.variant_id = daily_inventory_rollup.variant_id;

grant select on public.inventory_report_view to anon, authenticated;
