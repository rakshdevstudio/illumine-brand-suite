import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const orderId = '0b25d0c3-f466-4260-a13b-2ce1720493c8'; // Existing order created by check_policy
  const { data, error } = await supabase.from('order_items').insert({
    order_id: orderId,
    product_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
    variant_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
    quantity: 1,
    price: 100
  }).select('*');
  console.log(error || "Success inserting order_items");
}

main();
