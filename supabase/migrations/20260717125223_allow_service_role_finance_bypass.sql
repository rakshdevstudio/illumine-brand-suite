-- Allow the system service_role (e.g. Edge Functions) to bypass the finance admin check
-- This enables automated payments like Razorpay webhooks to reuse the same record_payment RPC as the POS.

CREATE OR REPLACE FUNCTION public.assert_finance_admin()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service_role to bypass RBAC for system-automated financial operations
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_finance_admin() THEN
    RAISE EXCEPTION 'Admin role required for financial operation'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;
