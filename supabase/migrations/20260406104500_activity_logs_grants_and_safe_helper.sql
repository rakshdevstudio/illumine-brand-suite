-- Ensure activity_logs table exists and is writable by authenticated users
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_type text not null,
  entity_id uuid,
  entity_type text,
  description text,
  performed_by uuid
);

grant insert, select on public.activity_logs to authenticated, service_role;

create index if not exists idx_activity_logs_created on public.activity_logs(created_at desc);

-- Safe helper that never throws
create or replace function public.log_product_activity(
  p_action text,
  p_entity_id uuid,
  p_entity_type text,
  p_description text,
  p_actor uuid default null
) returns void language plpgsql security definer as $$
begin
  begin
    insert into public.activity_logs(action_type, entity_id, entity_type, description, performed_by, created_at)
    values (p_action, p_entity_id, p_entity_type, p_description, p_actor, now());
  exception when others then
    -- swallow to avoid breaking main transaction
    null;
  end;
end;
$$;
