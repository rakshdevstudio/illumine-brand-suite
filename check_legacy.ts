import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const legacyOrderPayload = {
    customer_name: "Meghana",
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

  const attempt = await supabase
    .from("orders")
    .insert({
      id: crypto.randomUUID(),
      ...legacyOrderPayload,
    });
  
  console.log(attempt.error || "Success");
}

main();
