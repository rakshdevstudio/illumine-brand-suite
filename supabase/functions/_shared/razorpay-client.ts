// @deno-types="npm:@types/razorpay@^2.8.2"
import Razorpay from "https://esm.sh/razorpay@2.9.2";

let razorpay: Razorpay | null = null;

export function getRazorpayClient() {
  if (razorpay) {
    return razorpay;
  }

  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

  if (!keyId || !keySecret) {
    // Return null instead of throwing, the check will be handled in the main function
    return null;
  }
  
  console.log("Initializing Razorpay client");
  razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpay;
}
