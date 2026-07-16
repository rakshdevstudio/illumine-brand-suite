import "https://deno.land/std@0.192.0/dotenv/load.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

interface VerifyPayload {
    order_id: string;
    payment_id: string;
    razorpay_signature: string;
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

        const supabase = createSupabaseClient(authHeader);
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (userError) {
            console.error("User authentication failed:", userError.message);
            return new Response(JSON.stringify({ error: "Authentication failed", details: userError.message }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 401,
            });
        }
        console.log("JWT verified, user identified:", user.id);

        const { order_id, payment_id, razorpay_signature }: VerifyPayload = await req.json();
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
            // Here you would typically update your database to mark the order as paid.
            // e.g., await serviceRoleClient.from('orders').update({ status: 'paid' }).eq('id', order_id);

            return new Response(JSON.stringify({ success: true }), {
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
        return new Response(JSON.stringify({ 
            success: false, 
            stage: "verify_payment",
            message: error.message,
            details: error.stack 
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }
});
