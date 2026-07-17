import "https://deno.land/std@0.192.0/dotenv/load.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient, serviceRoleClient } from "../_shared/supabase-client.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

interface CartItem {
    productId: string;
    variantId: string;
    name: string;
    price: number;
    quantity: number;
    size?: string;
}

interface VerifyPayload {
    order_id: string;
    payment_id: string;
    razorpay_signature: string;
    checkout?: {
        customer_name: string;
        email: string;
        phone: string;
        alternate_phone?: string;
        student_name?: string;
        grade?: string;
        address: string;
        city?: string;
        pincode?: string;
        school_id: string;
        gender?: string;
    };
    items?: CartItem[];
}

const arrayBufferToHex = (buffer: ArrayBuffer) => {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

Deno.serve(async (req) => {
    console.log("verify-razorpay-payment function received a request");

    if (req.method === "OPTIONS") {
        console.log("Handling OPTIONS preflight request");
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            console.error("Missing Authorization header");
            return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 401,
            });
        }
        console.log("Authorization header found");

        // We do NOT enforce supabase.auth.getUser() here because the store uses a guest checkout flow.
        // The frontend correctly sends the SUPABASE_ANON_KEY when the user is unauthenticated.
        // Calling getUser() with the anon key would throw an error and break the guest checkout.
        console.log("Guest checkout verification permitted. Anon key received.");

        const payload: VerifyPayload = await req.json();
        const { order_id, payment_id, razorpay_signature, checkout, items } = payload;
        console.log("Request payload received for verification:", { order_id, payment_id });

        if (!order_id || !payment_id || !razorpay_signature) {
            console.error("Invalid payload for verification");
            return new Response(JSON.stringify({ error: "Invalid payload. 'order_id', 'payment_id', and 'razorpay_signature' are required." }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            });
        }

        const text = `${order_id}|${payment_id}`;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(RAZORPAY_KEY_SECRET!),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"]
        );
        const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(text));
        const generated_signature = arrayBufferToHex(signature);

        console.log("Signature verification details:", {
            received_signature: razorpay_signature,
            generated_signature: generated_signature,
        });
        
        if (generated_signature === razorpay_signature) {
            console.log("Signature verification successful");
            
            // Body is already parsed into payload above
            // 1. Idempotency Check
            const idempotencyKey = `razorpay_${payment_id}`;
            const { data: existingPayment, error: existingPaymentError } = await serviceRoleClient
                .from('payments')
                .select('reference_id')
                .eq('idempotency_key', idempotencyKey)
                .maybeSingle();

            if (existingPayment) {
                console.log("Payment already processed:", idempotencyKey);
                const { data: invoiceData } = await serviceRoleClient
                    .from('invoices')
                    .select('order_id')
                    .eq('id', existingPayment.reference_id)
                    .single();
                
                return new Response(JSON.stringify({ 
                    success: true, 
                    orderId: invoiceData?.order_id || null,
                    invoiceId: existingPayment.reference_id,
                    message: "Payment already processed" 
                }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 200,
                });
            }

            // 2. Format payload for create_order RPC
            if (!checkout || !items || items.length === 0) {
                 throw new Error("Missing checkout or items payload for order creation");
            }

            const rpcPayload = {
                customer_name: checkout.customer_name,
                phone: checkout.phone,
                address: checkout.address || "-",
                school_id: checkout.school_id,
                branch_id: null,
                payment_mode: 'ONLINE',
                source: 'storefront',
                channel: 'web',
                created_from: 'storefront_checkout',
                items: items.map((item: any) => ({
                    product_id: item.productId,
                    variant_id: item.variantId,
                    quantity: item.quantity,
                    unit_price: item.price
                }))
            };

            // 3. Call create_order RPC
            console.log("Creating order in database via RPC");
            const { data: orderData, error: orderError } = await serviceRoleClient
                .rpc('create_order', { p_payload: rpcPayload });

            if (orderError) {
                console.error("Order creation failed:", orderError);
                throw orderError;
            }
            if (!orderData || !orderData.order_id) throw new Error("Order creation failed: No order ID returned");
            
            const supabaseOrderId = orderData.order_id;
            console.log("Order created successfully:", supabaseOrderId);

            // 4. Update order status to CONFIRMED to trigger invoice if needed
            // The RPC returns 'pending', so we update to 'CONFIRMED' to signify successful payment
            await serviceRoleClient
                .from('orders')
                .update({ status: 'CONFIRMED' })
                .eq('id', supabaseOrderId);

            // 5. Fetch generated invoice (should be created by trigger)
            const { data: invoiceData, error: invoiceError } = await serviceRoleClient
                .from('invoices')
                .select('id, total')
                .eq('order_id', supabaseOrderId)
                .maybeSingle();

            if (invoiceError) throw invoiceError;
            if (!invoiceData) throw new Error("Invoice was not generated for order: " + supabaseOrderId);

            console.log("Invoice retrieved:", invoiceData.id);

            // 6. Insert payment record
            console.log("Recording payment");
            const { error: paymentError } = await serviceRoleClient
                .from('payments')
                .insert({
                    reference_type: 'invoice',
                    reference_id: invoiceData.id,
                    amount: invoiceData.total,
                    payment_mode: 'bank', // Enum: 'cash', 'bank', 'upi'
                    idempotency_key: idempotencyKey,
                    notes: `Razorpay Order ID: ${order_id}, Payment ID: ${payment_id}`
                });
                
            if (paymentError) {
                console.error("Payment recording failed:", paymentError);
                throw paymentError;
            }
            console.log("Payment recorded successfully");

            // 7. Queue confirmation email
            if (checkout.email) {
                console.log("Queueing email confirmation for:", checkout.email);
                // Fire and forget - don't await this
                serviceRoleClient.functions.invoke('send-order-confirmation', {
                    body: {
                        email: checkout.email,
                        name: checkout.customer_name,
                        orderId: supabaseOrderId,
                        items: items,
                        total: invoiceData.total
                    }
                }).catch(e => console.error("Failed to queue email:", e));
            }

            return new Response(JSON.stringify({ 
                success: true, 
                orderId: supabaseOrderId,
                invoiceId: invoiceData.id,
                paymentId: payment_id
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            });
        } else {
            console.error("Signature verification failed: Mismatch");
            return new Response(JSON.stringify({ success: false, reason: "Signature mismatch" }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            });
        }

    } catch (error) {
        console.error("Error verifying Razorpay payment:", error);
        const err = error as Error;
        return new Response(JSON.stringify({ 
            success: false, 
            stage: "verify_payment",
            message: err.message,
            details: err.stack 
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
