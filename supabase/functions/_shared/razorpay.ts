import { getEnv } from "./storefront-checkout.ts";

export const getRazorpayConfig = () => ({
  keyId: getEnv("RAZORPAY_KEY_ID"),
  keySecret: getEnv("RAZORPAY_KEY_SECRET"),
});

const buildBasicAuthHeader = () => {
  const { keyId, keySecret } = getRazorpayConfig();
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
};

export const createRazorpayOrder = async ({
  amount,
  receipt,
  notes,
}: {
  amount: number;
  receipt: string;
  notes?: Record<string, string>;
}) => {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: buildBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount,
      currency: "INR",
      receipt,
      notes,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.description || payload?.error?.reason || "Failed to create Razorpay order");
  }

  return payload as {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status: string;
  };
};

export const fetchRazorpayPayment = async (paymentId: string) => {
  const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: {
      Authorization: buildBasicAuthHeader(),
    },
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.description || "Failed to fetch Razorpay payment");
  }

  return payload as {
    id: string;
    order_id: string;
    status: string;
    amount: number;
    currency: string;
  };
};

export const verifyRazorpaySignature = ({
  orderId,
  paymentId,
  signature,
}: {
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { keySecret } = getRazorpayConfig();
  const encoder = new TextEncoder();
  const keyData = encoder.encode(keySecret);
  const payload = encoder.encode(`${orderId}|${paymentId}`);

  return crypto.subtle
    .importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then((key) => crypto.subtle.sign("HMAC", key, payload))
    .then((signatureBuffer) => {
      const expected = Array.from(new Uint8Array(signatureBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

      return expected === signature;
    });
};
