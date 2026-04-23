-- Financial-grade purchase voiding:
-- - purchase row remains for audit
-- - stock is reversed through movement engine
-- - original ledger is preserved
-- - reversal ledger is posted as purchase_void

ALTER TYPE public.purchase_status ADD VALUE IF NOT EXISTS 'voided';

CREATE OR REPLACE FUNCTION public.void_purchase(p_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase public.purchases%ROWTYPE;
  v_item record;
  v_stock_check record;
  v_current_stock integer;
  v_original_ledger_count integer := 0;
  v_reversal_lines jsonb := '[]'::jsonb;
  v_reversal_ledger_id uuid;
BEGIN
  PERFORM public.assert_finance_admin();

  SELECT *
  INTO v_purchase
  FROM public.purchases
  WHERE id = p_purchase_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase % not found', p_purchase_id;
  END IF;

  IF lower(COALESCE(v_purchase.status::text, '')) = 'voided' THEN
    RETURN jsonb_build_object(
      'purchase_id', v_purchase.id,
      'purchase_number', v_purchase.purchase_number,
      'status', 'voided',
      'no_op', true
    );
  END IF;

  PERFORM 1
  FROM public.purchase_items
  WHERE purchase_id = p_purchase_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.purchase_items
    WHERE purchase_id = p_purchase_id
  ) THEN
    RAISE EXCEPTION 'Purchase % has no items to void', p_purchase_id;
  END IF;

  IF v_purchase.branch_id IS NOT NULL THEN
    FOR v_stock_check IN
      SELECT
        pi.variant_id,
        SUM(pi.quantity)::integer AS quantity_to_reverse
      FROM public.purchase_items pi
      WHERE pi.purchase_id = p_purchase_id
      GROUP BY pi.variant_id
    LOOP
      SELECT bi.stock
      INTO v_current_stock
      FROM public.branch_inventory bi
      WHERE bi.branch_id = v_purchase.branch_id
        AND bi.variant_id = v_stock_check.variant_id
      FOR UPDATE;

      IF v_current_stock IS NULL THEN
        RAISE EXCEPTION
          'Cannot void purchase %. Stock row missing for variant % in branch %',
          p_purchase_id,
          v_stock_check.variant_id,
          v_purchase.branch_id;
      END IF;

      IF v_current_stock - v_stock_check.quantity_to_reverse < 0 THEN
        RAISE EXCEPTION
          'Cannot void purchase %. Insufficient stock for variant %. available=%, required=%',
          p_purchase_id,
          v_stock_check.variant_id,
          v_current_stock,
          v_stock_check.quantity_to_reverse;
      END IF;
    END LOOP;
  END IF;

  SELECT COUNT(DISTINCT le.id)
  INTO v_original_ledger_count
  FROM public.ledger_entries le
  WHERE lower(COALESCE(le.reference_type, '')) = 'purchase'
    AND le.reference_id = p_purchase_id;

  IF ROUND(COALESCE(v_purchase.total, 0), 2) > 0 AND v_original_ledger_count = 0 THEN
    RAISE EXCEPTION 'Original purchase ledger entry not found for purchase %', p_purchase_id;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'account_code', grouped.account_code,
        'debit', CASE WHEN grouped.reversal_side = 'debit' THEN grouped.amount ELSE 0 END,
        'credit', CASE WHEN grouped.reversal_side = 'credit' THEN grouped.amount ELSE 0 END
      )
      ORDER BY grouped.account_code, grouped.reversal_side
    ),
    '[]'::jsonb
  )
  INTO v_reversal_lines
  FROM (
    SELECT
      a.code AS account_code,
      CASE
        WHEN lower(COALESCE(lel.side::text, '')) = 'debit' THEN 'credit'
        ELSE 'debit'
      END AS reversal_side,
      ROUND(SUM(COALESCE(lel.amount, 0)), 2) AS amount
    FROM public.ledger_entries le
    JOIN public.ledger_entry_lines lel
      ON lel.ledger_entry_id = le.id
    JOIN public.accounts a
      ON a.id = lel.account_id
    WHERE lower(COALESCE(le.reference_type, '')) = 'purchase'
      AND le.reference_id = p_purchase_id
    GROUP BY
      a.code,
      CASE
        WHEN lower(COALESCE(lel.side::text, '')) = 'debit' THEN 'credit'
        ELSE 'debit'
      END
  ) AS grouped;

  FOR v_item IN
    SELECT
      pi.id,
      pi.variant_id,
      pi.quantity
    FROM public.purchase_items pi
    WHERE pi.purchase_id = p_purchase_id
    ORDER BY pi.created_at, pi.id
  LOOP
    IF v_purchase.branch_id IS NOT NULL THEN
      PERFORM public.apply_inventory_movement(
        v_purchase.branch_id,
        v_item.variant_id,
        'OUT',
        v_item.quantity,
        'SYSTEM',
        p_purchase_id,
        'Purchase void stock reversal for ' || COALESCE(v_purchase.purchase_number, p_purchase_id::text),
        auth.uid()
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_reversal_lines) > 0 THEN
    v_reversal_ledger_id := public.create_balanced_ledger_entry(
      'purchase_void',
      p_purchase_id,
      CURRENT_DATE,
      v_purchase.branch_id,
      'Purchase void reversal for ' || COALESCE(v_purchase.purchase_number, p_purchase_id::text),
      v_reversal_lines
    );
  END IF;

  UPDATE public.purchases
  SET
    status = 'voided',
    updated_at = now()
  WHERE id = p_purchase_id;

  PERFORM public.log_financial_action(
    'void_purchase',
    'purchase',
    p_purchase_id,
    jsonb_build_object(
      'purchase_number', v_purchase.purchase_number,
      'reversal_ledger_entry_id', v_reversal_ledger_id,
      'total', ROUND(COALESCE(v_purchase.total, 0), 2)
    ),
    NULL,
    'rpc',
    jsonb_build_object('status', v_purchase.status),
    jsonb_build_object('status', 'voided')
  );

  BEGIN
    INSERT INTO public.activity_logs (
      action_type,
      entity_id,
      entity_type,
      description,
      performed_by,
      created_at
    )
    VALUES (
      'purchase_voided',
      p_purchase_id,
      'purchase',
      'Purchase voided by admin: ' || COALESCE(v_purchase.purchase_number, p_purchase_id::text),
      auth.uid(),
      now()
    );
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'purchase_id', p_purchase_id,
    'purchase_number', v_purchase.purchase_number,
    'status', 'voided',
    'reversal_ledger_entry_id', v_reversal_ledger_id,
    'no_op', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_purchase(uuid) TO authenticated;
