-- Reporting engine foundation.
-- Adds report-friendly payment metadata, performance indexes, and database views for
-- order, GST, inventory, and branch analytics.
-- GST amounts are derived at 18% for GST-enabled orders until a stored tax model exists.

alter table public.orders
  add column if not exists payment_mode text;

with payment_note_map as (
  select
    order_id,
    max(
      case
        when note ilike '%Payment Method: UPI%' then 'UPI'
        when note ilike '%Payment Method: CASH%' then 'CASH'
        when note ilike '%Payment Method: CARD%' then 'CARD'
        when note ilike '%Payment Method: BANK%' then 'BANK_TRANSFER'
        when note ilike '%Payment Method: ONLINE%' then 'ONLINE'
        else null
      end
    ) as parsed_payment_mode,
    bool_or(note ilike '%Order Source: POS%') as is_pos
  from public.order_notes
  group by order_id
)
update public.orders o
set payment_mode = coalesce(
  payment_note_map.parsed_payment_mode,
  case when payment_note_map.is_pos then 'UNKNOWN' else 'ONLINE' end,
  'UNKNOWN'
)
from payment_note_map
where payment_note_map.order_id = o.id
  and o.payment_mode is null;

update public.orders
set payment_mode = 'ONLINE'
where payment_mode is null
  and coalesce(email, '') <> '';

update public.orders
set payment_mode = 'UNKNOWN'
where payment_mode is null;

alter table public.orders
  alter column payment_mode set default 'UNKNOWN',
  alter column payment_mode set not null;

alter table public.orders
  drop constraint if exists orders_payment_mode_check;

alter table public.orders
  add constraint orders_payment_mode_check
  check (payment_mode in ('ONLINE', 'CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'UNKNOWN'));

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create index if not exists orders_branch_school_created_at_idx
  on public.orders (branch_id, school_id, created_at desc);

create index if not exists orders_payment_mode_idx
  on public.orders (payment_mode);

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists order_items_product_variant_idx
  on public.order_items (product_id, variant_id);

create index if not exists product_variants_product_id_idx
  on public.product_variants (product_id);

create index if not exists products_school_id_idx
  on public.products (school_id);

create index if not exists inventory_movements_branch_variant_created_idx
  on public.inventory_movements (branch_id, variant_id, created_at desc);

drop view if exists public.branch_report_view;
drop view if exists public.gst_report_view;
drop view if exists public.sales_report_view;
drop view if exists public.sales_item_report_view;
drop view if exists public.inventory_report_view;

create view public.sales_item_report_view as
select
  o.id as order_id,
  o.id::text as order_id_text,
  timezone('Asia/Kolkata', o.created_at)::date as order_date,
  o.created_at as order_created_at,
  o.customer_name,
  o.phone,
  o.school_id,
  coalesce(s.name, 'Unassigned School') as school_name,
  o.branch_id,
  coalesce(b.name, 'Unassigned Branch') as branch_name,
  oi.id as order_item_id,
  oi.product_id,
  p.name as product_name,
  oi.variant_id,
  coalesce(nullif(trim(pv.size), ''), 'Default') as variant_size,
  pv.sku as sku,
  coalesce(oi.quantity, 0)::integer as quantity,
  coalesce(oi.price, 0)::numeric as unit_price,
  coalesce(oi.discount, 0)::numeric as discount_amount,
  round((coalesce(oi.price, 0)::numeric * coalesce(oi.quantity, 0)::numeric), 2) as line_amount,
  round(
    case
      when coalesce(o.total_amount, 0)::numeric > 0 then (coalesce(oi.price, 0)::numeric * coalesce(oi.quantity, 0)::numeric) / coalesce(o.total_amount, 0)::numeric * 100
      else 0
    end,
    2
  ) as revenue_share,
  round(coalesce(o.total_amount, 0)::numeric, 2) as order_total_amount,
  round(
    case
      when o.gst_number is not null then coalesce(o.total_amount, 0)::numeric / 1.18
      else coalesce(o.total_amount, 0)::numeric
    end,
    2
  ) as order_taxable_amount,
  round(
    case
      when o.gst_number is not null then coalesce(o.total_amount, 0)::numeric - (coalesce(o.total_amount, 0)::numeric / 1.18)
      else 0
    end,
    2
  ) as order_gst_amount,
  o.gst_number,
  coalesce(o.is_gst_order, false) as is_gst_order,
  o.status::text as status,
  o.payment_mode
from public.orders o
join public.order_items oi
  on oi.order_id = o.id
join public.products p
  on p.id = oi.product_id
left join public.product_variants pv
  on pv.id = oi.variant_id
left join public.schools s
  on s.id = o.school_id
left join public.branches b
  on b.id = o.branch_id;

create view public.sales_report_view as
select
  item_rows.order_id,
  max(item_rows.order_id_text) as order_id_text,
  max(item_rows.order_date) as order_date,
  max(item_rows.order_created_at) as order_created_at,
  max(item_rows.customer_name) as customer_name,
  max(item_rows.phone) as phone,
  min(item_rows.school_id::text)::uuid as school_id,
  max(item_rows.school_name) as school_name,
  min(item_rows.branch_id::text)::uuid as branch_id,
  max(item_rows.branch_name) as branch_name,
  string_agg(
    concat_ws(
      ' ',
      item_rows.product_name,
      case when item_rows.variant_size <> 'Default' then '(' || item_rows.variant_size || ')' end,
      'x' || item_rows.quantity::text
    ),
    ', '
    order by lower(item_rows.product_name), lower(item_rows.variant_size), item_rows.order_item_id::text
  ) as items,
  sum(item_rows.quantity)::integer as total_quantity,
  max(item_rows.order_total_amount) as total_amount,
  max(item_rows.order_taxable_amount) as taxable_amount,
  max(item_rows.order_gst_amount) as gst_amount,
  max(item_rows.gst_number) as gst_number,
  bool_or(item_rows.is_gst_order) as is_gst_order,
  max(item_rows.status) as status,
  max(item_rows.payment_mode) as payment_mode,
  trim(
    both ' ' from concat_ws(
      ' ',
      max(item_rows.order_id_text),
      max(item_rows.customer_name),
      max(item_rows.phone),
      max(item_rows.gst_number),
      max(item_rows.school_name),
      max(item_rows.branch_name)
    )
  ) as search_text
from public.sales_item_report_view item_rows
group by item_rows.order_id;

create view public.gst_report_view as
select
  order_id,
  order_id_text,
  order_date,
  order_created_at,
  customer_name,
  phone,
  school_id,
  school_name,
  branch_id,
  branch_name,
  taxable_amount,
  gst_amount,
  total_amount,
  gst_number,
  status,
  payment_mode
from public.sales_report_view
where gst_number is not null;

create view public.inventory_report_view as
with daily_inventory_rollup as (
  select
    timezone('Asia/Kolkata', im.created_at)::date as movement_date,
    im.branch_id,
    b.name as branch_name,
    im.variant_id,
    pv.product_id,
    p.name as product_name,
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
  group by
    timezone('Asia/Kolkata', im.created_at)::date,
    im.branch_id,
    b.name,
    im.variant_id,
    pv.product_id,
    p.name,
    coalesce(nullif(trim(pv.size), ''), 'Default')
)
select
  daily_inventory_rollup.movement_date,
  daily_inventory_rollup.branch_id,
  daily_inventory_rollup.branch_name,
  daily_inventory_rollup.variant_id,
  daily_inventory_rollup.product_id,
  daily_inventory_rollup.product_name,
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

create view public.branch_report_view as
select
  order_date as report_date,
  branch_id,
  branch_name,
  status,
  count(*)::integer as total_orders,
  round(sum(total_amount)::numeric, 2) as total_revenue,
  round(sum(gst_amount)::numeric, 2) as gst_revenue
from public.sales_report_view
where branch_id is not null
group by order_date, branch_id, branch_name, status;

grant select on public.sales_item_report_view to anon, authenticated;
grant select on public.sales_report_view to anon, authenticated;
grant select on public.gst_report_view to anon, authenticated;
grant select on public.inventory_report_view to anon, authenticated;
grant select on public.branch_report_view to anon, authenticated;
