-- Context-aware inventory alerts RPC for admin dashboard
create or replace function public.get_inventory_alerts(
  p_school_id uuid default null,
  p_class_id uuid default null,
  p_gender text default null
)
returns table (
  variant_id uuid,
  product_name text,
  size text,
  school_id uuid,
  school text,
  class_id uuid,
  class text,
  gender text,
  current_stock integer,
  alert_threshold integer,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  with stock_rollup as (
    select
      bi.variant_id,
      sum(coalesce(bi.stock, 0))::integer as current_stock
    from public.branch_inventory bi
    group by bi.variant_id
  )
  select
    pv.id as variant_id,
    p.name as product_name,
    coalesce(nullif(trim(pv.size), ''), 'Default') as size,
    coalesce(pa.school_id, p.school_id) as school_id,
    coalesce(s.name, 'Unassigned School') as school,
    coalesce(pa.class_id, p.class_id) as class_id,
    coalesce(c.name, 'Unassigned Class') as class,
    coalesce(pa.gender, p.gender, 'Unassigned Gender') as gender,
    coalesce(sr.current_stock, 0) as current_stock,
    coalesce(pv.low_stock_threshold, 5) as alert_threshold,
    case
      when coalesce(sr.current_stock, 0) <= 0 then 'Critical'
      when coalesce(sr.current_stock, 0) <= coalesce(pv.low_stock_threshold, 5) then 'Low'
      else 'Healthy'
    end as status
  from public.product_variants pv
  join public.products p
    on p.id = pv.product_id
  left join stock_rollup sr
    on sr.variant_id = pv.id
  left join public.product_assignments pa
    on pa.product_id = p.id
  left join public.schools s
    on s.id = coalesce(pa.school_id, p.school_id)
  left join public.classes c
    on c.id = coalesce(pa.class_id, p.class_id)
  where lower(coalesce(pv.status, 'active')) = 'active'
    and (p_school_id is null or coalesce(pa.school_id, p.school_id) = p_school_id)
    and (p_class_id is null or coalesce(pa.class_id, p.class_id) = p_class_id)
    and (p_gender is null or lower(coalesce(pa.gender, p.gender, '')) = lower(p_gender))
  order by
    case
      when coalesce(sr.current_stock, 0) <= 0 then 0
      when coalesce(sr.current_stock, 0) <= coalesce(pv.low_stock_threshold, 5) then 1
      else 2
    end,
    coalesce(sr.current_stock, 0) asc,
    p.name asc,
    size asc;
$$;

grant execute on function public.get_inventory_alerts(uuid, uuid, text) to authenticated;
