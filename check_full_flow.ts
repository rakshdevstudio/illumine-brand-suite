import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data: variants, error: vErr } = await supabase.from('product_variants').select('id, product_id').limit(1);
  if (vErr || !variants || variants.length === 0) return;
  const variant = variants[0];

  const legacyOrderPayload = {
    customer_name: "Meghana Full Flow",
    email: "test@example.com",
    phone: "9999999999",
    alternate_phone: null,
    payment_mode: "ONLINE",
    student_name: "Meghana",
    student_class: "CLASS 10",
    grade: "CLASS 10",
    address: "test",
    city: "bangalore",
    pincode: "567890",
    school_id: "1aec1860-9ef6-45e9-9d9f-b7dd9b315754",
    total_amount: 0,
    status: "PLACED",
  };

  const orderId = crypto.randomUUID();
  const attempt = await supabase.from("orders").insert({ id: orderId, ...legacyOrderPayload });
  if (attempt.error) { console.log("Order insert failed", attempt.error); return; }

  const { error: preSyncErr } = await supabase.from("orders").update({ total_amount: 100 }).eq("id", orderId);
  if (preSyncErr) { console.log("Order update failed", preSyncErr); return; }

  const { error: itemErr } = await supabase.from("order_items").insert({
    order_id: orderId,
    product_id: variant.product_id,
    variant_id: variant.id,
    quantity: 1,
    price: 100,
  });

  if (itemErr) { console.log("Order items insert failed", itemErr); return; }

  console.log("Success full flow");
}

main();
