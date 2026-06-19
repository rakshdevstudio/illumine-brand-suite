-- Fix anonymous checkout failure due to financial_audit_logs.performed_by NOT NULL constraint.
-- Allows system actor tracking for unauthenticated ecommerce events.

-- 1. Safely modify schema
ALTER TABLE public.financial_audit_logs ALTER COLUMN performed_by DROP NOT NULL;
ALTER TABLE public.financial_audit_logs ADD COLUMN IF NOT EXISTS actor_type text NOT NULL DEFAULT 'system';

-- 2. Backfill existing records
UPDATE public.financial_audit_logs SET actor_type = 'authenticated_user' WHERE performed_by IS NOT NULL;

-- 3. Replace the logging function to support both authenticated and anonymous calls
CREATE OR REPLACE FUNCTION public.log_financial_action(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_request_id text DEFAULT NULL,
  p_source text DEFAULT 'rpc',
  p_before jsonb DEFAULT NULL,
  p_after jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_type text;
BEGIN
  IF v_uid IS NOT NULL THEN
    v_actor_type := 'authenticated_user';
  ELSE
    v_actor_type := 'customer_checkout';
  END IF;

  INSERT INTO public.financial_audit_logs (
    action,
    entity_type,
    entity_id,
    payload,
    request_id,
    source,
    before_data,
    after_data,
    performed_by,
    actor_type
  )
  VALUES (
    COALESCE(NULLIF(btrim(p_action), ''), 'unknown_action'),
    COALESCE(NULLIF(btrim(p_entity_type), ''), 'unknown_entity'),
    p_entity_id,
    COALESCE(p_payload, '{}'::jsonb),
    p_request_id,
    p_source,
    p_before,
    p_after,
    v_uid,
    v_actor_type
  );
END;
$$;

-- Maintain the same execution privileges
GRANT EXECUTE ON FUNCTION public.log_financial_action(text, text, uuid, jsonb, text, text, jsonb, jsonb) TO authenticated;
