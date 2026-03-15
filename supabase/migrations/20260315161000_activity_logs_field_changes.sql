-- Add field-level change tracking to activity logs

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS field_changed TEXT,
  ADD COLUMN IF NOT EXISTS old_value TEXT,
  ADD COLUMN IF NOT EXISTS new_value TEXT;

CREATE INDEX IF NOT EXISTS idx_activity_logs_field_changed
  ON public.activity_logs(field_changed);