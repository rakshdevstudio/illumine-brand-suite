import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data: orderData, error: oErr } = await supabase.from('orders').select('id').limit(1);
  if (oErr || !orderData || orderData.length === 0) return;

  const { data, error } = await supabase.rpc('create_invoice_from_order', {
    p_order_id: orderData[0].id
  });
  console.log(error || "Success invoice");
}

main();
