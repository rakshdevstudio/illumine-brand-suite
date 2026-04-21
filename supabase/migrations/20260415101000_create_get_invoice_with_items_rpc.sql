-- RPC: get one invoice with joined item/product/variant details.
-- Returns a structured JSON document suitable for invoice rendering.

CREATE OR REPLACE FUNCTION public.getInvoiceWithItems(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', i.id,
    'order_id', i.order_id,
    'invoice_number', i.invoice_number,
    'created_at', i.created_at,
    'subtotal', i.subtotal,
    'cgst', i.cgst,
    'sgst', i.sgst,
    'total', i.total,
    'customer_name', i.customer_name,
    'phone', i.phone,
    'address', i.address,
    'invoice_items', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ii.id,
          'product_id', ii.product_id,
          'variant_id', ii.variant_id,
          'product_name', COALESCE(p.name, 'Product'),
          'variant_size', COALESCE(pv.size, '-'),
          'quantity', ii.quantity,
          'unit_price', ii.unit_price,
          'gst_percentage', ii.gst_percentage,
          'cgst_amount', ii.cgst_amount,
          'sgst_amount', ii.sgst_amount,
          'total', ii.total
        )
        ORDER BY ii.id
      ) FILTER (WHERE ii.id IS NOT NULL),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.invoices i
  LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
  LEFT JOIN public.products p ON p.id = ii.product_id
  LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
  WHERE i.id = p_invoice_id
  GROUP BY i.id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.getInvoiceWithItems(uuid) TO anon, authenticated;
