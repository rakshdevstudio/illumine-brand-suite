/// <reference lib="deno" />
// send-order-email
// Called after an order is placed or its status is updated.
// Expects JSON body: { type, order, customerEmail, customerName, items? }
//
// Set RESEND_API_KEY in Supabase project secrets:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxx
//
// Set RESEND_FROM in Supabase project secrets (e.g. "Illume <orders@yourdomain.com>"):
//   supabase secrets set RESEND_FROM="Illume <orders@yourdomain.com>"

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM    = Deno.env.get("RESEND_FROM") ?? "Illume <no-reply@illumine.co.in>";

type OrderEmailType = "order_placed" | "order_status_updated";

interface OrderItem {
  name: string;
  size?: string;
  color?: string;
  quantity: number;
  price: number;
}

interface OrderEmailPayload {
  type: OrderEmailType;
  order: {
    id: string;
    status: string;
    total_amount: number;
    customer_name: string;
    address?: string;
    city?: string;
    pincode?: string;
  };
  customerEmail: string;
  customerName: string;
  items?: OrderItem[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const statusLabel: Record<string, string> = {
  pending:    "Pending Confirmation",
  confirmed:  "Confirmed",
  processing: "Being Processed",
  shipped:    "Shipped",
  delivered:  "Delivered",
  cancelled:  "Cancelled",
};

function buildOrderPlacedEmail(payload: OrderEmailPayload): string {
  const { order, customerName, items = [] } = payload;
  const orderId = order.id.slice(0, 8).toUpperCase();
  const itemRows = items.map((item) => `
    <tr>
      <td style="padding:8px 0;font-size:13px;">${item.name}${item.size ? ` — ${item.size}` : ""}${item.color ? ` / ${item.color}` : ""}</td>
      <td style="padding:8px 0;font-size:13px;text-align:right;">×${item.quantity}</td>
      <td style="padding:8px 0;font-size:13px;text-align:right;">${fmt(item.price * item.quantity)}</td>
    </tr>`).join("");

  const delivery = [order.address, order.city, order.pincode].filter(Boolean).join(", ");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;max-width:560px;width:100%;">
        <!-- Header -->
        <tr><td style="background:#1a1a1a;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;letter-spacing:6px;text-transform:uppercase;font-weight:300;">ILLUME</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="font-size:13px;color:#666;margin:0 0 8px;">Hi ${customerName},</p>
          <h1 style="font-size:20px;font-weight:300;letter-spacing:2px;text-transform:uppercase;margin:0 0 24px;">Order Confirmed</h1>
          <p style="font-size:13px;color:#555;margin:0 0 24px;">
            Thank you for your order. We'll notify you when it's on its way.
          </p>

          <div style="background:#f9f9f9;border:1px solid #e5e5e5;padding:16px 20px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#999;">Order</p>
            <p style="margin:0;font-size:16px;font-weight:500;">#${orderId}</p>
          </div>

          ${items.length > 0 ? `
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
            <thead>
              <tr style="border-bottom:1px solid #e5e5e5;">
                <th style="padding:6px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;text-align:left;color:#999;font-weight:400;">Item</th>
                <th style="padding:6px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;text-align:right;color:#999;font-weight:400;">Qty</th>
                <th style="padding:6px 0;font-size:10px;letter-spacing:2px;text-transform:uppercase;text-align:right;color:#999;font-weight:400;">Price</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr style="border-top:1px solid #e5e5e5;">
                <td colspan="2" style="padding:10px 0;font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#333;">Total</td>
                <td style="padding:10px 0;font-size:15px;font-weight:500;text-align:right;">${fmt(order.total_amount)}</td>
              </tr>
            </tfoot>
          </table>` : ""}

          ${delivery ? `
          <div style="border-top:1px solid #e5e5e5;padding-top:20px;">
            <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#999;margin:0 0 6px;">Delivery Address</p>
            <p style="font-size:13px;color:#333;margin:0;">${delivery}</p>
          </div>` : ""}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:11px;color:#aaa;letter-spacing:1px;text-align:center;">
            © 2026 ILLUME · All rights reserved
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildStatusUpdateEmail(payload: OrderEmailPayload): string {
  const { order, customerName } = payload;
  const orderId = order.id.slice(0, 8).toUpperCase();
  const label = statusLabel[order.status] ?? order.status;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;max-width:560px;width:100%;">
        <tr><td style="background:#1a1a1a;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:18px;letter-spacing:6px;text-transform:uppercase;font-weight:300;">ILLUME</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:13px;color:#666;margin:0 0 8px;">Hi ${customerName},</p>
          <h1 style="font-size:20px;font-weight:300;letter-spacing:2px;text-transform:uppercase;margin:0 0 24px;">Order Update</h1>
          <p style="font-size:13px;color:#555;margin:0 0 24px;">
            Your order <strong>#${orderId}</strong> has been updated.
          </p>
          <div style="background:#f9f9f9;border:1px solid #e5e5e5;padding:16px 20px;margin-bottom:24px;display:inline-block;width:100%;box-sizing:border-box;">
            <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#999;">New Status</p>
            <p style="margin:0;font-size:16px;font-weight:500;text-transform:capitalize;">${label}</p>
          </div>
          ${order.status === "shipped" ? `
          <p style="font-size:13px;color:#555;margin:0;">
            Your order is on its way! You'll receive it soon.
          </p>` : ""}
          ${order.status === "delivered" ? `
          <p style="font-size:13px;color:#555;margin:0;">
            Your order has been delivered. We hope you love it!
          </p>` : ""}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #e5e5e5;">
          <p style="margin:0;font-size:11px;color:#aaa;letter-spacing:1px;text-align:center;">
            © 2026 ILLUME · All rights reserved
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const payload: OrderEmailPayload = await req.json();
    const { type, customerEmail, customerName } = payload;

    if (!customerEmail) {
      return new Response(JSON.stringify({ error: "customerEmail is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const html =
      type === "order_placed"
        ? buildOrderPlacedEmail(payload)
        : buildStatusUpdateEmail(payload);

    const subject =
      type === "order_placed"
        ? `Order Confirmed – #${payload.order.id.slice(0, 8).toUpperCase()}`
        : `Order Update – #${payload.order.id.slice(0, 8).toUpperCase()} is now ${statusLabel[payload.order.status] ?? payload.order.status}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [customerEmail],
        subject,
        html,
      }),
    });

    const resBody = await res.json();

    if (!res.ok) {
      console.error("Resend error:", resBody);
      return new Response(JSON.stringify({ error: resBody }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resBody.id }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("send-order-email error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
