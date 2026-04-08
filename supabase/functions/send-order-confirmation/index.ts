/// <reference lib="deno" />
// send-order-confirmation
// Sends an order confirmation email to the customer after a successful order.
//
// Expected request body:
// {
//   email: string,
//   name: string,
//   orderId: string,
//   items: Array<{ name: string, size?: string, quantity: number, price: number }>,
//   total: number
// }
//
// Required Supabase secrets:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxx
//   supabase secrets set RESEND_FROM="Illume <orders@yourdomain.com>"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
// Use Resend's pre-verified shared sender as fallback so email works without a
// custom verified domain. Set RESEND_FROM secret to override once your domain
// is verified in Resend: e.g. "Illume <orders@illumine.co.in>"
const RESEND_FROM    = Deno.env.get("RESEND_FROM") ?? "Illume <onboarding@resend.dev>";

interface OrderItem {
  name: string;
  size?: string;
  quantity: number;
  price: number;
}

interface Payload {
  email: string;
  name: string;
  orderId: string;
  items: OrderItem[];
  total: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function buildHtml(payload: Payload): string {
  const { name, orderId, items, total } = payload;
  const shortId = orderId.slice(0, 8).toUpperCase();

  const itemRows = items
    .map(
      (item) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;color:#333;">
        ${item.name}${item.size ? ` &mdash; ${item.size}` : ""}
      </td>
      <td style="padding:8px 0;font-size:13px;color:#333;text-align:right;">&times;${item.quantity}</td>
      <td style="padding:8px 0;font-size:13px;color:#333;text-align:right;">${fmt(item.price * item.quantity)}</td>
    </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Order Confirmed – ILLUME</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border:1px solid #e5e5e5;max-width:560px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:18px;letter-spacing:6px;
                      text-transform:uppercase;font-weight:300;">ILLUME</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="font-size:13px;color:#666;margin:0 0 8px;">Hi ${name},</p>
            <h1 style="font-size:20px;font-weight:300;letter-spacing:2px;
                       text-transform:uppercase;margin:0 0 24px;">Order Confirmed</h1>
            <p style="font-size:13px;color:#555;margin:0 0 24px;">
              Thank you for your order. We're processing it and will notify you once it's shipped.
            </p>

            <!-- Order ID badge -->
            <div style="background:#f9f9f9;border:1px solid #e5e5e5;
                        padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;
                        text-transform:uppercase;color:#999;">Order ID</p>
              <p style="margin:0;font-size:16px;font-weight:500;">#${shortId}</p>
            </div>

            ${
              items.length > 0
                ? `
            <!-- Items table -->
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;margin-bottom:24px;">
              <thead>
                <tr style="border-bottom:1px solid #e5e5e5;">
                  <th style="padding:6px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;
                             text-align:left;color:#999;font-weight:400;">Item</th>
                  <th style="padding:6px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;
                             text-align:right;color:#999;font-weight:400;">Qty</th>
                  <th style="padding:6px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;
                             text-align:right;color:#999;font-weight:400;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
                <tr style="border-top:1px solid #e5e5e5;">
                  <td colspan="2" style="padding:12px 0;font-size:11px;
                                         letter-spacing:2px;text-transform:uppercase;color:#999;">
                    Total
                  </td>
                  <td style="padding:12px 0;font-size:15px;font-weight:500;
                              text-align:right;">${fmt(total)}</td>
                </tr>
              </tbody>
            </table>`
                : ""
            }

            <p style="font-size:13px;color:#555;margin:0 0 32px;">
              Your order is being processed and we will notify you once it is shipped.
            </p>

            <p style="font-size:13px;color:#555;margin:0 0 6px;">
              Thank you for choosing Illume.
            </p>
            <p style="font-size:13px;color:#555;margin:0 0 2px;">
              Support: hello@illume.co.in
            </p>
            <p style="font-size:13px;color:#555;margin:0 0 24px;">
              Website: www.illumeonline.in
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;border-top:1px solid #e5e5e5;
                     padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;letter-spacing:2px;
                      text-transform:uppercase;color:#999;">
              &copy; 2026 ILLUME. ALL RIGHTS RESERVED.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  try {
    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return new Response(JSON.stringify({ success: false, accepted: false, reason: "email_service_not_configured" }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: Payload = await req.json();
    const { email, name, orderId, items, total } = payload;

    if (!email || !orderId) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shortId = orderId.slice(0, 8).toUpperCase();

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: `Order Confirmed – ILLUME (#${shortId})`,
        html: buildHtml(payload),
      }),
    });

    if (!resendResponse.ok) {
      const errorBody = await resendResponse.text();
      console.error("Email sending failed", {
        status: resendResponse.status,
        body: errorBody,
      });
      return new Response(JSON.stringify({
        success: false,
        accepted: false,
        reason: "email_provider_error",
        provider_status: resendResponse.status,
      }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await resendResponse.json();
    console.log("Email sent successfully", result);
    return new Response(JSON.stringify({ success: true, accepted: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Email sending failed", err);
    return new Response(JSON.stringify({ success: false, accepted: false, reason: "internal_error" }), {
      status: 202,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
