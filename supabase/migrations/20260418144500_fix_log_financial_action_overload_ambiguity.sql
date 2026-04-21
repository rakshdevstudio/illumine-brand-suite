-- Fix ambiguous log_financial_action resolution.
-- Zero-trust migration introduced a 4-arg overload, while later migration introduced
-- an 8-arg signature with defaults. Calls with 4 args then became ambiguous.

DROP FUNCTION IF EXISTS public.log_financial_action(text, text, uuid, jsonb);

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
BEGIN
  INSERT INTO public.financial_audit_logs (
    action,
    entity_type,
    entity_id,
    payload,
    request_id,
    source,
    before_data,
    after_data,
    performed_by
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
    auth.uid()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_financial_action(text, text, uuid, jsonb, text, text, jsonb, jsonb) TO authenticated;
