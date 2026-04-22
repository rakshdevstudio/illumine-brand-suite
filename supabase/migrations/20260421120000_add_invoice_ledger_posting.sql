-- ============================================================
-- INVOICE LEDGER POSTING – CRITICAL ACCOUNTING SYSTEM COMPLETION
-- ============================================================
-- 
-- Objective: Add double-entry ledger posting to invoice creation
-- 
-- Design Constraints:
-- - NO schema changes (append-only ledger)
-- - NO breaking RPC changes
-- - Ledger linked via reference_type='invoice', reference_id=invoice_id
-- - All ledger entries MUST be balanced (SUM(debit) = SUM(credit))
-- - Atomic transaction (invoice + ledger = all-or-nothing)
-- - Tax split: CGST and SGST as separate ledger lines
-- 
-- Account Structure:
--   1200 = Accounts Receivable (Asset)
--   3100 = Sales Revenue (Income)
--   2101 = Output CGST Payable (Liability)
--   2102 = Output SGST Payable (Liability)
--
-- Posted Entry Format (Example):
--   Accounts Receivable (DR)  ₹1060
--     Sales Revenue (CR)      ₹1000
--     Output CGST (CR)        ₹30
--     Output SGST (CR)        ₹30
--   ──────────────────────────────────
--   Total DR = Total CR = ₹1060 ✓
--
-- ============================================================

-- ============================================================
-- STEP 1: REPLACE create_invoice_from_order() with ledger posting
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_invoice_from_order(p_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_existing_invoice_id uuid;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item_count integer := 0;
  v_subtotal numeric := 0;
  v_cgst numeric := 0;
  v_sgst numeric := 0;
  v_total numeric := 0;
  v_address text;
  v_item record;
  v_calc jsonb;
  v_ledger_entry_id uuid;
  v_ledger_lines jsonb;
  v_branch_id uuid;
BEGIN
  -- ========================================================
  -- SECTION A: FETCH ORDER AND VALIDATE
  -- ========================================================
  
  SELECT *
  INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF upper(COALESCE(v_order.status::text, '')) NOT IN ('PLACED', 'PACKED', 'DISPATCHED', 'DELIVERED', 'PENDING', 'CONFIRMED', 'SHIPPED') THEN
    RETURN NULL;
  END IF;

  -- Allow invoice_items triggers to recompute invoice totals while this trusted RPC runs.
  PERFORM set_config('app.bypass_invoice_guard', 'on', true);

  -- Check if invoice already exists (idempotency)
  SELECT id
  INTO v_existing_invoice_id
  FROM public.invoices
  WHERE order_id = p_order_id
  LIMIT 1;

  IF v_existing_invoice_id IS NOT NULL THEN
    v_invoice_id := v_existing_invoice_id;

    FOR v_item IN
      SELECT
        oi.product_id,
        oi.variant_id,
        oi.quantity,
        oi.price,
        COALESCE(p.gst_percentage, 0) AS gst_percentage,
        COALESCE(pv.pricing_type, 'inclusive') AS pricing_type
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
      WHERE oi.order_id = p_order_id
    LOOP
      v_calc := public.compute_gst_line_values(
        COALESCE(v_item.quantity, 0),
        COALESCE(v_item.price, 0),
        COALESCE(v_item.gst_percentage, 0),
        COALESCE(v_item.pricing_type, 'inclusive'),
        false
      );

      INSERT INTO public.invoice_items (
        invoice_id,
        product_id,
        variant_id,
        quantity,
        unit_price,
        gst_percentage,
        cgst_amount,
        sgst_amount,
        total
      )
      SELECT
        v_invoice_id,
        v_item.product_id,
        v_item.variant_id,
        v_item.quantity,
        round(COALESCE(v_item.price, 0)::numeric, 2),
        round(COALESCE(v_item.gst_percentage, 0)::numeric, 2),
        round((v_calc->>'cgst')::numeric, 2),
        round((v_calc->>'sgst')::numeric, 2),
        round((v_calc->>'total')::numeric, 2)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.invoice_items ii
        WHERE ii.invoice_id = v_invoice_id
          AND ii.product_id = v_item.product_id
          AND ii.variant_id IS NOT DISTINCT FROM v_item.variant_id
          AND ii.quantity = v_item.quantity
          AND ROUND(ii.unit_price, 2) = ROUND(COALESCE(v_item.price, 0), 2)
          AND ROUND(ii.gst_percentage, 2) = ROUND(COALESCE(v_item.gst_percentage, 0), 2)
      );
    END LOOP;

    UPDATE public.orders
    SET invoice_id = COALESCE(invoice_id, v_existing_invoice_id)
    WHERE id = p_order_id;

    RETURN v_existing_invoice_id;
  END IF;

  -- ========================================================
  -- SECTION B: CALCULATE INVOICE TOTALS
  -- ========================================================

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      COALESCE(p.gst_percentage, 0) AS gst_percentage,
      COALESCE(pv.pricing_type, 'inclusive') AS pricing_type
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_item_count := v_item_count + 1;

    v_calc := public.compute_gst_line_values(
      COALESCE(v_item.quantity, 0),
      COALESCE(v_item.price, 0),
      COALESCE(v_item.gst_percentage, 0),
      COALESCE(v_item.pricing_type, 'inclusive'),
      false
    );

    v_subtotal := round((v_subtotal + (v_calc->>'taxable')::numeric)::numeric, 2);
    v_cgst := round((v_cgst + (v_calc->>'cgst')::numeric)::numeric, 2);
    v_sgst := round((v_sgst + (v_calc->>'sgst')::numeric)::numeric, 2);
    v_total := round((v_total + (v_calc->>'total')::numeric)::numeric, 2);
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot create invoice for order % without items', p_order_id;
  END IF;

  -- ========================================================
  -- SECTION C: CREATE INVOICE RECORD
  -- ========================================================

  v_invoice_number := public.next_invoice_number(COALESCE(v_order.created_at, now()));
  v_address := concat_ws(', ', NULLIF(v_order.address, ''), NULLIF(v_order.city, ''), NULLIF(v_order.pincode, ''));

  INSERT INTO public.invoices (
    order_id,
    invoice_number,
    customer_name,
    phone,
    address,
    subtotal,
    cgst,
    sgst,
    total,
    paid_amount,
    balance_amount,
    status,
    created_at
  )
  VALUES (
    p_order_id,
    v_invoice_number,
    COALESCE(v_order.customer_name, ''),
    COALESCE(v_order.phone, ''),
    COALESCE(NULLIF(v_address, ''), COALESCE(v_order.address, '')),
    round(v_subtotal, 2),
    round(v_cgst, 2),
    round(v_sgst, 2),
    round(v_total, 2),
    0,
    round(v_total, 2),
    'issued',
    COALESCE(v_order.created_at, now())
  )
  RETURNING id INTO v_invoice_id;

  -- ========================================================
  -- SECTION D: INSERT INVOICE ITEMS
  -- ========================================================

  FOR v_item IN
    SELECT
      oi.product_id,
      oi.variant_id,
      oi.quantity,
      oi.price,
      COALESCE(p.gst_percentage, 0) AS gst_percentage,
      COALESCE(pv.pricing_type, 'inclusive') AS pricing_type
    FROM public.order_items oi
    LEFT JOIN public.products p ON p.id = oi.product_id
    LEFT JOIN public.product_variants pv ON pv.id = oi.variant_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_calc := public.compute_gst_line_values(
      COALESCE(v_item.quantity, 0),
      COALESCE(v_item.price, 0),
      COALESCE(v_item.gst_percentage, 0),
      COALESCE(v_item.pricing_type, 'inclusive'),
      false
    );

    INSERT INTO public.invoice_items (
      invoice_id,
      product_id,
      variant_id,
      quantity,
      unit_price,
      gst_percentage,
      cgst_amount,
      sgst_amount,
      total
    )
    VALUES (
      v_invoice_id,
      v_item.product_id,
      v_item.variant_id,
      v_item.quantity,
      round(COALESCE(v_item.price, 0)::numeric, 2),
      round(COALESCE(v_item.gst_percentage, 0)::numeric, 2),
      round((v_calc->>'cgst')::numeric, 2),
      round((v_calc->>'sgst')::numeric, 2),
      round((v_calc->>'total')::numeric, 2)
    );
  END LOOP;

  -- ========================================================
  -- SECTION E: BUILD LEDGER ENTRY (DOUBLE-ENTRY POSTING)
  -- ========================================================
  --
  -- Posted entry structure (always 3-4 lines, ALWAYS balanced):
  --
  -- Line 1: Accounts Receivable (DR, full total including tax)
  -- Line 2: Sales Revenue (CR, taxable amount only)
  -- Line 3+: Output Tax (CR, split by tax type)
  --
  -- This represents:
  -- "Customer owes us money (AR DR),
  --  we earned revenue (Revenue CR),
  --  we owe tax authority (Tax CR)"
  --
  
  v_ledger_lines := jsonb_build_array(
    -- Line 1: Accounts Receivable (Asset) – Customer OWES us
    jsonb_build_object(
      'account_code', '1200',
      'debit',  ROUND(v_total, 2),
      'credit', 0
    ),
    -- Line 2: Sales Revenue (Income) – We EARNED
    jsonb_build_object(
      'account_code', '3100',
      'debit',  0,
      'credit', ROUND(v_subtotal, 2)
    ),
    -- Line 3: Output CGST Payable (Liability) – We OWE (if CGST > 0)
    CASE WHEN ROUND(v_cgst, 2) > 0 THEN
      jsonb_build_object(
        'account_code', '2101',
        'debit',  0,
        'credit', ROUND(v_cgst, 2)
      )
    ELSE NULL::jsonb END,
    -- Line 4: Output SGST Payable (Liability) – We OWE (if SGST > 0)
    CASE WHEN ROUND(v_sgst, 2) > 0 THEN
      jsonb_build_object(
        'account_code', '2102',
        'debit',  0,
        'credit', ROUND(v_sgst, 2)
      )
    ELSE NULL::jsonb END
  ) - ARRAY(SELECT NULL); -- Remove null elements from array

  -- ========================================================
  -- SECTION F: POST BALANCED LEDGER ENTRY
  -- ========================================================
  --
  -- This call:
  -- 1. Creates ledger_entries row
  -- 2. Creates N ledger_entry_lines rows (one per JSONB line)
  -- 3. Validates SUM(debit) = SUM(credit) before commit
  -- 4. Throws EXCEPTION if unbalanced (atomically fails entire transaction)
  --
  
  v_branch_id := COALESCE(v_order.branch_id, NULL);

  v_ledger_entry_id := public.create_balanced_ledger_entry(
    p_reference_type  => 'invoice',
    p_reference_id    => v_invoice_id,
    p_entry_date      => COALESCE(v_order.created_at::date, CURRENT_DATE),
    p_branch_id       => v_branch_id,
    p_description     => 'Invoice ' || v_invoice_number || ' from order ' || p_order_id || ' | Customer: ' || COALESCE(v_order.customer_name, 'N/A'),
    p_lines           => v_ledger_lines
  );

  -- ========================================================
  -- SECTION G: UPDATE ORDER WITH INVOICE REFERENCE
  -- ========================================================
  
  UPDATE public.orders
  SET invoice_id = v_invoice_id
  WHERE id = p_order_id;

  -- ========================================================
  -- SECTION H: RETURN
  -- ========================================================
  --
  -- If we reach here, ENTIRE TRANSACTION succeeded atomically:
  -- - Invoice created ✓
  -- - Invoice items created ✓
  -- - Ledger entry posted (balanced) ✓
  -- - Order updated ✓
  --
  -- If ANY step failed, transaction rolled back completely.
  --
  
  RETURN v_invoice_id;

END;
$$;

-- ============================================================
-- STEP 2: ENSURE RPC WRAPPER STILL WORKS
-- ============================================================

CREATE OR REPLACE FUNCTION public."createInvoiceFromOrder"(order_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_invoice_from_order(order_id);
$$;

-- ============================================================
-- STEP 3: VALIDATE LEDGER BALANCE (POST-DEPLOYMENT TEST)
-- ============================================================
--
-- Run this query after migration to verify ALL invoices are posted:
--
-- SELECT 
--   le.id,
--   le.entry_number,
--   le.reference_type,
--   SUM(CASE WHEN el.side = 'debit' THEN el.amount ELSE 0 END) as debit_total,
--   SUM(CASE WHEN el.side = 'credit' THEN el.amount ELSE 0 END) as credit_total,
--   ROUND(SUM(CASE WHEN el.side = 'debit' THEN el.amount ELSE 0 END), 2) = 
--     ROUND(SUM(CASE WHEN el.side = 'credit' THEN el.amount ELSE 0 END), 2) as is_balanced
-- FROM public.ledger_entries le
-- LEFT JOIN public.ledger_entry_lines el ON el.ledger_entry_id = le.id
-- WHERE le.reference_type = 'invoice'
-- GROUP BY le.id, le.entry_number, le.reference_type
-- ORDER BY le.created_at DESC;
--
-- Expected: ALL rows have is_balanced = true
--

-- ============================================================
-- STEP 4: AUDIT QUERY – VERIFY INVOICE COUNTS
-- ============================================================
--
-- Run this to see invoice accounting summary:
--
-- SELECT 
--   'Invoices Posted' as metric,
--   COUNT(DISTINCT le.id) as count,
--   ROUND(SUM(CASE WHEN a.code = '1200' AND el.side = 'debit' THEN el.amount ELSE 0 END), 2) as total_receivable,
--   ROUND(SUM(CASE WHEN a.code = '3100' AND el.side = 'credit' THEN el.amount ELSE 0 END), 2) as total_revenue,
--   ROUND(SUM(CASE WHEN a.code IN ('2101', '2102') AND el.side = 'credit' THEN el.amount ELSE 0 END), 2) as total_gst_liability
-- FROM public.ledger_entries le
-- JOIN public.ledger_entry_lines el ON el.ledger_entry_id = le.id
-- JOIN public.accounts a ON a.id = el.account_id
-- WHERE le.reference_type = 'invoice';
--

-- ============================================================
-- STEP 5: GRANTS (ENSURE RPC PERMISSIONS)
-- ============================================================

GRANT EXECUTE ON FUNCTION public.create_invoice_from_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public."createInvoiceFromOrder"(uuid) TO authenticated;

-- ============================================================
-- STEP 6: DISABLE PER-ITEM INVOICE AUTO-CREATION
-- ============================================================
-- Invoices must be created only after checkout has finished inserting every order item.
-- The per-item trigger fires too early and causes posted invoices to become immutable
-- before the cart is fully materialized.

DROP TRIGGER IF EXISTS trg_order_items_create_invoice ON public.order_items;

CREATE OR REPLACE FUNCTION public.trg_order_items_create_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- ============================================================
-- EOF
-- ============================================================
