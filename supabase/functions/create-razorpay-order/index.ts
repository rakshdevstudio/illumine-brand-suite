import "https://deno.land/std@0.192.0/dotenv/load.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getRazorpayClient } from "../_shared/razorpay-client.ts";
import { createSupabaseClient } from "../_shared/supabase-client.ts";

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID");
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET");

interface CartItem {
  price: number;
  quantity: number;
}

interface RequestPayload {
  items: CartItem[];
  checkout?: Record<string, any>;
  receipt?: string;
  notes?: Record<string, string | number>;
}

Deno.serve(async (req) => {
  console.log("create-razorpay-order function received a request");

  if (req.method === "OPTIONS") {
    console.log("Handling OPTIONS preflight request");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Environment variable validation
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      console.error("Missing Razorpay credentials");
      return new Response(JSON.stringify({
        success: false,
        stage: "env_validation",
        message: "Razorpay credentials are not set in environment variables.",
        details: "RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }
    console.log("Environment variables validated");

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

    const payload: RequestPayload = await req.json();
    console.log("Request payload received:", JSON.stringify(payload, null, 2));

    if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
      console.error("Invalid payload. 'items' array is missing or empty.");
      return new Response(JSON.stringify({ error: "Invalid payload. 'items' array is missing or empty." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const totalAmount = payload.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const amountInPaise = Math.round(totalAmount * 100);

    if (amountInPaise < 100) {
      console.error("Invalid amount:", amountInPaise);
      return new Response(JSON.stringify({ error: "Invalid amount. Minimum amount is 100 paise." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    console.log("Input validated: amount is", amountInPaise);

    const razorpay = getRazorpayClient();
    if (!razorpay) {
        // This case should be covered by the initial check, but as a safeguard:
        throw new Error("Razorpay client could not be initialized.");
    }
    console.log("Razorpay client initialized");
    
    const orderOptions = {
      amount: amountInPaise,
      currency: "INR",
      receipt: payload.receipt || `rcpt_${new Date().getTime()}`,
      notes: payload.notes || {},
    };
    console.log("Creating Razorpay order with options:", orderOptions);

    let order;
    try {
        order = await razorpay.orders.create(orderOptions);
        console.log("Razorpay API response:", order);
    } catch (error) {
        console.error("Razorpay order creation failed:", error);
        return new Response(JSON.stringify({
            success: false,
            stage: "create_order",
            message: error.message,
            details: error.stack,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
        });
    }

    return new Response(JSON.stringify({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key: RAZORPAY_KEY_ID,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    return new Response(JSON.stringify({ 
        success: false, 
        stage: "unknown",
        message: error.message,
        details: error.stack 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
