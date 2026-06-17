import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.from('orders').insert({
    customer_name: 'Test Web POS',
    phone: '9999999999',
    school_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
    address: 'Test',
    total_amount: 0,
    status: 'PLACED',
    source: 'pos'
  }).select('*');
  console.log(error || data);
}

main();
