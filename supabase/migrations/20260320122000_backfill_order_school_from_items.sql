-- Backfill and maintain orders.school_id from order_items/products where deterministically possible.

create or replace function public.sync_order_school_from_items(target_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_school_id uuid;
  school_count integer;
  existing_school_id uuid;
begin
  if target_order_id is null then
    return;
  end if;

  select school_id
    into existing_school_id
  from public.orders
  where id = target_order_id;

  if existing_school_id is not null then
    return;
  end if;

  select
    (array_agg(distinct p.school_id) filter (where p.school_id is not null))[1] as school_id,
    count(distinct p.school_id) filter (where p.school_id is not null) as cnt
  into resolved_school_id, school_count
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = target_order_id;

  if school_count = 1 and resolved_school_id is not null then
    update public.orders
    set school_id = resolved_school_id,
        updated_at = now()
    where id = target_order_id
      and school_id is null;
  end if;
end;
$$;

-- One-time backfill for historical orders.
with candidates as (
  select
    oi.order_id,
    (array_agg(distinct p.school_id) filter (where p.school_id is not null))[1] as resolved_school_id,
    count(distinct p.school_id) filter (where p.school_id is not null) as school_count
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  join public.orders o on o.id = oi.order_id
  where o.school_id is null
  group by oi.order_id
)
update public.orders o
set school_id = c.resolved_school_id,
    updated_at = now()
from candidates c
where o.id = c.order_id
  and o.school_id is null
  and c.school_count = 1
  and c.resolved_school_id is not null;

create or replace function public.trg_order_items_sync_order_school()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_order_school_from_items(old.order_id);
    return old;
  end if;

  perform public.sync_order_school_from_items(new.order_id);

  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform public.sync_order_school_from_items(old.order_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_items_sync_order_school on public.order_items;
create trigger trg_order_items_sync_order_school
after insert or update of order_id, product_id or delete
on public.order_items
for each row
execute function public.trg_order_items_sync_order_school();
