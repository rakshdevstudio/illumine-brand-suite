-- Financial security test cases for zero-trust ERP hardening.
-- Run each section with the relevant user token/session.

-- 1) Direct invoice insert must fail (REST/SQL write path blocked)
-- Expected: permission denied or RLS violation.
INSERT INTO public.invoices (order_id, invoice_number, customer_name, phone, address, subtotal, cgst, sgst, igst, total)
VALUES (gen_random_uuid(), 'ATTACK-001', 'Tamper', '9999999999', 'unauthorized', 1, 0, 0, 0, 1);

-- 2) RPC call as non-admin must fail
-- Expected: "Admin role required for financial operation" (ERRCODE 42501)
SELECT public.record_payment(
  '00000000-0000-0000-0000-000000000000'::uuid,
  100,
  'bank',
  'REF-ATTACK',
  'unauthorized test',
  NULL
);

-- 3) RPC call as admin must succeed
-- Replace with valid IDs in admin session.
-- Expected: returns JSON with payment_id + ledger_entry_id.
SELECT public.record_payment(
  'REPLACE_WITH_VALID_INVOICE_ID'::uuid,
  100,
  'bank',
  'REF-OK-001',
  'authorized payment',
  NULL
);

-- 4) Manual ledger tampering must fail
-- Expected: permission denied or RLS violation.
INSERT INTO public.ledger_entries (
  entry_number,
  entry_date,
  source_type,
  source_id,
  narration,
  created_by,
  reference_type,
  reference_id,
  description,
  txn_date
)
VALUES (
  'LE-HACK-001',
  CURRENT_DATE,
  'adjustment',
  gen_random_uuid(),
  'manual tamper',
  auth.uid(),
  'tamper',
  gen_random_uuid(),
  'manual tamper',
  CURRENT_DATE
);

-- Optional: verify audit trail (admin only)
SELECT *
FROM public.financial_audit_logs
ORDER BY performed_at DESC
LIMIT 20;
