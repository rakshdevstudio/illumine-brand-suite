import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export type CartItemInput = {
  productId: string;
  variantId: string;
  quantity: number;
  name?: string;
  size?: string;
  price?: number;
};

export type CheckoutPayload = {
  customer_name: string;
  email: string;
  phone: string;
  alternate_phone?: string;
  student_name: string;
  grade: string;
  address: string;
  city: string;
  pincode: string;
  school_id: string;
  gender?: string;
};

type ResolvedCartItem = {
  productId: string;
  variantId: string;
  quantity: number;
  price: number;
  name: string;
  size: string;
};

export type FinalizedOrderResult = {
  orderId: string;
  invoiceId: string;
  totalAmount: number;
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

export const getEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

export const buildSupabaseAdmin = () =>
  createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    },
  });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const normalizePhone = (value: unknown) => String(value ?? "").replace(/\D/g, "");

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export const validateCheckoutPayload = (payload: Partial<CheckoutPayload>): CheckoutPayload => {
  const checkout = {
    customer_name: normalizeText(payload.customer_name),
    email: normalizeText(payload.email),
    phone: normalizePhone(payload.phone),
    alternate_phone: normalizePhone(payload.alternate_phone),
    student_name: normalizeText(payload.student_name),
    grade: normalizeText(payload.grade),
    address: normalizeText(payload.address),
    city: normalizeText(payload.city),
    pincode: normalizePhone(payload.pincode),
    school_id: normalizeText(payload.school_id),
    gender: normalizeText(payload.gender) || "Unisex",
  };

  if (!checkout.customer_name) throw new Error("customer_name is required");
  if (!checkout.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(checkout.email)) throw new Error("A valid email is required");
  if (!/^\d{10}$/.test(checkout.phone)) throw new Error("phone must be 10 digits");
  if (checkout.alternate_phone && !/^\d{10}$/.test(checkout.alternate_phone)) throw new Error("alternate_phone must be 10 digits");
  if (!checkout.student_name) throw new Error("student_name is required");
  if (!checkout.grade) throw new Error("grade is required");
  if (!checkout.address) throw new Error("address is required");
  if (!checkout.city) throw new Error("city is required");
  if (!/^\d{6}$/.test(checkout.pincode)) throw new Error("pincode must be 6 digits");
  if (!isUuid(checkout.school_id)) throw new Error("school_id must be a valid UUID");

  return checkout;
};

export const validateCartItems = (items: unknown): CartItemInput[] => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("At least one cart item is required");
  }

  return items.map((item, index) => {
    const row = item as Record<string, unknown>;
    const productId = normalizeText(row.productId);
    const variantId = normalizeText(row.variantId);
    const quantity = Number(row.quantity ?? 0);

    if (!isUuid(productId)) throw new Error(`items[${index}].productId must be a valid UUID`);
    if (!isUuid(variantId)) throw new Error(`items[${index}].variantId must be a valid UUID`);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new Error(`items[${index}].quantity must be a positive integer`);

    return {
      productId,
      variantId,
      quantity,
      name: normalizeText(row.name),
      size: normalizeText(row.size),
      price: Number(row.price ?? 0),
    };
  });
};

export const resolveCheckoutCart = async (
  supabaseAdmin: ReturnType<typeof buildSupabaseAdmin>,
  items: CartItemInput[],
) => {
  const variantIds = [...new Set(items.map((item) => item.variantId))];
  const productIds = [...new Set(items.map((item) => item.productId))];

  const [{ data: variants, error: variantError }, { data: inventoryRows, error: inventoryError }] = await Promise.all([
    supabaseAdmin
      .from("product_variants")
      .select("id, product_id, size, price_override, status, products(name, price)")
      .in("id", variantIds),
    supabaseAdmin
      .from("branch_inventory")
      .select("variant_id, stock")
      .in("variant_id", variantIds),
  ]);

  if (variantError) throw variantError;
  if (inventoryError) throw inventoryError;

  const variantMap = new Map(
    (variants ?? []).map((variant: any) => [
      String(variant.id),
      {
        productId: String(variant.product_id),
        size: String(variant.size ?? ""),
        status: String(variant.status ?? ""),
        price: Number(variant.price_override ?? variant.products?.price ?? 0),
        name: String(variant.products?.name ?? "Product"),
      },
    ]),
  );

  const stockByVariant = new Map<string, number>();
  for (const row of inventoryRows ?? []) {
    const variantId = String((row as any).variant_id);
    const stock = Number((row as any).stock ?? 0);
    stockByVariant.set(variantId, (stockByVariant.get(variantId) ?? 0) + stock);
  }

  const resolvedItems: ResolvedCartItem[] = items.map((item) => {
    const variant = variantMap.get(item.variantId);
    if (!variant) throw new Error(`Variant not found: ${item.variantId}`);
    if (variant.productId !== item.productId) throw new Error(`Variant ${item.variantId} does not belong to product ${item.productId}`);
    if (variant.status && variant.status.toLowerCase() !== "active") throw new Error(`Variant ${item.variantId} is not active`);

    const availableStock = stockByVariant.get(item.variantId) ?? 0;
    if (availableStock < item.quantity) {
      throw new Error(`Insufficient stock for ${variant.name}${variant.size ? ` (${variant.size})` : ""}`);
    }

    return {
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
      price: Number(variant.price),
      name: item.name || variant.name,
      size: item.size || variant.size || "default",
    };
  });

  const totalAmount = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (productIds.length === 0 || totalAmount <= 0) {
    throw new Error("Unable to calculate a valid order total");
  }

  return {
    items: resolvedItems,
    totalAmount: Number(totalAmount.toFixed(2)),
  };
};

const waitForPersistedOrderItems = async (
  supabaseAdmin: ReturnType<typeof buildSupabaseAdmin>,
  orderId: string,
  expectedTotal: number,
  expectedCount: number,
) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("order_items")
      .select("quantity, price")
      .eq("order_id", orderId);

    if (error) throw error;

    const rows = data ?? [];
    const total = rows.reduce((sum, item: any) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0), 0);

    if (rows.length >= expectedCount && Math.abs(total - expectedTotal) <= 0.01) {
      return;
    }

    await sleep(250);
  }

  throw new Error("Order items were not fully persisted before invoice creation");
};

const deductStockAcrossBranches = async (
  supabaseAdmin: ReturnType<typeof buildSupabaseAdmin>,
  variantId: string,
  productId: string,
  quantity: number,
  orderId: string,
) => {
  const { data, error } = await supabaseAdmin
    .from("branch_inventory")
    .select("branch_id, stock")
    .eq("variant_id", variantId)
    .order("stock", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []).map((row: any) => ({
    branch_id: String(row.branch_id),
    stock: Number(row.stock ?? 0),
  }));

  const totalStock = rows.reduce((sum, row) => sum + row.stock, 0);
  if (totalStock < quantity) {
    throw new Error("Insufficient global stock for variant");
  }

  let remaining = quantity;
  for (const row of rows) {
    if (remaining <= 0) break;
    if (row.stock <= 0) continue;

    const toDeduct = Math.min(remaining, row.stock);
    const { error: movementError } = await supabaseAdmin.rpc("reserve_checkout_inventory_movement", {
      p_branch_id: row.branch_id,
      p_variant_id: variantId,
      p_type: "OUT",
      p_quantity: toDeduct,
      p_reference_type: "ORDER",
      p_reference_id: orderId,
      p_reason: "Global checkout deduction",
    });

    if (movementError) throw movementError;
    void productId;
    remaining -= toDeduct;
  }
};

const resolvePaymentActorId = async (
  supabaseAdmin: ReturnType<typeof buildSupabaseAdmin>,
) => {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["super_admin", "admin"])
    .order("role", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.user_id) {
    throw new Error("Unable to resolve a system payment actor");
  }

  return String(data.user_id);
};

const createPaymentRecord = async (
  supabaseAdmin: ReturnType<typeof buildSupabaseAdmin>,
  invoiceId: string,
  amount: number,
  paymentId: string,
  razorpayOrderId: string,
) => {
  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("invoices")
    .select("id, total, paid_amount, balance_amount, status, order_id")
    .eq("id", invoiceId)
    .single();

  if (invoiceError) throw invoiceError;

  const outstanding = Number(invoice.total ?? 0) - Number(invoice.paid_amount ?? 0);
  if (Math.abs(outstanding - amount) > 0.01 && outstanding > 0.01) {
    throw new Error(`Invoice outstanding mismatch. expected=${outstanding.toFixed(2)} actual=${amount.toFixed(2)}`);
  }

  const notes = `Razorpay payment verified. payment_id=${paymentId}; order_id=${razorpayOrderId}`;

  const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("idempotency_key", `razorpay:${paymentId}`)
    .maybeSingle();

  if (existingPaymentError) throw existingPaymentError;

  if (!existingPayment) {
    const createdBy = await resolvePaymentActorId(supabaseAdmin);

    const { error: paymentInsertError } = await supabaseAdmin
      .from("payments")
      .insert({
        reference_type: "invoice",
        reference_id: invoiceId,
        amount,
        payment_mode: "bank",
        payment_date: new Date().toISOString().slice(0, 10),
        notes,
        idempotency_key: `razorpay:${paymentId}`,
        created_by: createdBy,
      } as any);

    if (paymentInsertError) throw paymentInsertError;
  }

  const { error: invoiceUpdateError } = await supabaseAdmin
    .from("invoices")
    .update({
      paid_amount: Number(invoice.total ?? amount),
      balance_amount: 0,
      status: "paid",
    })
    .eq("id", invoiceId);

  if (invoiceUpdateError) throw invoiceUpdateError;
};

const sendOrderConfirmation = async (
  orderId: string,
  email: string,
  customerName: string,
  items: ResolvedCartItem[],
  totalAmount: number,
) => {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  await fetch(`${supabaseUrl}/functions/v1/send-order-confirmation`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      email,
      name: customerName,
      orderId,
      items: items.map((item) => ({
        name: item.name,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
      })),
      total: totalAmount,
    }),
  }).catch(() => undefined);
};

export const finalizeStorefrontOrder = async (
  checkout: CheckoutPayload,
  cart: { items: ResolvedCartItem[]; totalAmount: number },
  razorpay: { paymentId: string; razorpayOrderId: string },
): Promise<FinalizedOrderResult> => {
  const supabaseAdmin = buildSupabaseAdmin();
  const existingPaymentIdempotencyKey = `razorpay:${razorpay.paymentId}`;

  const { data: existingPayment } = await supabaseAdmin
    .from("payments")
    .select("reference_id")
    .eq("idempotency_key", existingPaymentIdempotencyKey)
    .maybeSingle();

  if (existingPayment?.reference_id) {
    const { data: invoice } = await supabaseAdmin
      .from("invoices")
      .select("id, order_id, total")
      .eq("id", String(existingPayment.reference_id))
      .maybeSingle();

    if (invoice?.order_id) {
      return {
        orderId: String(invoice.order_id),
        invoiceId: String(invoice.id),
        totalAmount: Number(invoice.total ?? cart.totalAmount),
      };
    }
  }

  const orderId = crypto.randomUUID();
  const legacyOrderPayload = {
    id: orderId,
    customer_name: checkout.customer_name,
    email: checkout.email,
    phone: checkout.phone,
    alternate_phone: checkout.alternate_phone || null,
    payment_mode: "ONLINE",
    student_name: checkout.student_name,
    student_class: checkout.grade,
    grade: checkout.grade,
    address: checkout.address,
    city: checkout.city,
    pincode: checkout.pincode,
    school_id: checkout.school_id,
    total_amount: 0,
    status: "PLACED",
  };

  const { error: orderError } = await supabaseAdmin.from("orders").insert(legacyOrderPayload as any);
  if (orderError) throw orderError;

  const { error: noteError } = await supabaseAdmin.from("order_notes").insert({
    order_id: orderId,
    note:
      `Student Name: ${checkout.student_name}\n` +
      `Grade: ${checkout.grade}\n` +
      `Alternate Phone: ${checkout.alternate_phone || "—"}\n` +
      `Razorpay Payment ID: ${razorpay.paymentId}\n` +
      `Razorpay Order ID: ${razorpay.razorpayOrderId}`,
  } as any);
  if (noteError) throw noteError;

  let runningOrderTotal = 0;
  for (const item of cart.items) {
    const lineTotal = Number((item.price * item.quantity).toFixed(2));
    const nextRunningTotal = Number((runningOrderTotal + lineTotal).toFixed(2));

    const { error: preSyncError } = await supabaseAdmin
      .from("orders")
      .update({ total_amount: nextRunningTotal } as any)
      .eq("id", orderId);

    if (preSyncError) throw preSyncError;

    const { error: itemError } = await supabaseAdmin.from("order_items").insert({
      order_id: orderId,
      product_id: item.productId,
      variant_id: item.variantId,
      quantity: item.quantity,
      price: item.price,
    } as any);

    if (itemError) throw itemError;
    runningOrderTotal = nextRunningTotal;
  }

  const { error: finalTotalError } = await supabaseAdmin
    .from("orders")
    .update({ total_amount: cart.totalAmount } as any)
    .eq("id", orderId);

  if (finalTotalError) throw finalTotalError;

  await waitForPersistedOrderItems(supabaseAdmin, orderId, cart.totalAmount, cart.items.length);

  const { data: checkoutLinkResult, error: attachError } = await supabaseAdmin.rpc("attach_checkout_entities_to_order", {
    p_order_id: orderId,
    p_customer_name: checkout.customer_name,
    p_customer_phone: checkout.phone,
    p_customer_email: checkout.email,
    p_student_name: checkout.student_name,
    p_school_id: checkout.school_id,
    p_class_name: checkout.grade,
    p_gender: checkout.gender || "Unisex",
    p_alternate_phone: checkout.alternate_phone || null,
  });

  if (attachError) throw attachError;

  let invoiceId =
    Array.isArray(checkoutLinkResult) && checkoutLinkResult.length > 0
      ? checkoutLinkResult[0]?.out_invoice_id ?? null
      : null;

  if (!invoiceId) {
    for (let attempt = 0; attempt < 3 && !invoiceId; attempt += 1) {
      try {
        await waitForPersistedOrderItems(supabaseAdmin, orderId, cart.totalAmount, cart.items.length);
        const { data: createdInvoiceId, error: invoiceError } = await supabaseAdmin.rpc("create_invoice_from_order", {
          p_order_id: orderId,
        });
        if (invoiceError) throw invoiceError;
        invoiceId = createdInvoiceId;
      } catch (error) {
        if (attempt === 2) throw error;
        await sleep(400);
      }
    }
  }

  if (!invoiceId) {
    throw new Error("Invoice was not created for the completed order");
  }

  await createPaymentRecord(supabaseAdmin, invoiceId, cart.totalAmount, razorpay.paymentId, razorpay.razorpayOrderId);

  for (const item of cart.items) {
    await deductStockAcrossBranches(supabaseAdmin, item.variantId, item.productId, item.quantity, orderId);
  }

  await sendOrderConfirmation(orderId, checkout.email, checkout.customer_name, cart.items, cart.totalAmount);

  return {
    orderId,
    invoiceId,
    totalAmount: cart.totalAmount,
  };
};
