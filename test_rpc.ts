import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.rpc('create_order', {
    p_payload: {
      customer_name: 'Test Flutter RPC',
      phone: '9999999999',
      address: 'Test',
      school_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
      items: [
        {
          product_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
          variant_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
          quantity: 1,
          unit_price: 0
        }
      ],
      source: 'pos',
      channel: 'pos',
      created_from: 'pos_app'
    }
  });
  console.log("RPC Error:", error);
  console.log("RPC Data:", data);

  if (data && data.order_id) {
    const { data: orderData } = await supabase.from('orders').select('id, source, channel, created_from').eq('id', data.order_id);
    console.log("Order Data:", orderData);
  }
}

main();
