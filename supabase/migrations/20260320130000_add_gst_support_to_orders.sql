-- GST support for checkout, orders, invoicing, and analytics

alter table public.orders
  add column if not exists gst_number text,
  add column if not exists is_gst_order boolean;

update public.orders
set is_gst_order = false
where is_gst_order is null;

alter table public.orders
  alter column is_gst_order set default false,
  alter column is_gst_order set not null;

alter table public.orders
  drop constraint if exists orders_gst_number_format_check;

alter table public.orders
  add constraint orders_gst_number_format_check
  check (
    gst_number is null
    or upper(gst_number) ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
  );

alter table public.orders
  drop constraint if exists orders_gst_presence_consistency_check;

alter table public.orders
  add constraint orders_gst_presence_consistency_check
  check (
    (is_gst_order = true and gst_number is not null)
    or (is_gst_order = false and gst_number is null)
  );

create index if not exists orders_is_gst_order_idx on public.orders (is_gst_order);
