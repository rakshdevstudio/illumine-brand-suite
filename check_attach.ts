import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.rpc('attach_checkout_entities_to_order', {
    p_order_id: '0b25d0c3-f466-4260-a13b-2ce1720493c8',
    p_customer_name: 'Test',
    p_customer_phone: '9999999999',
    p_customer_email: 'test@example.com',
    p_student_name: 'Test Student',
    p_school_id: '1aec1860-9ef6-45e9-9d9f-b7dd9b315754',
    p_class_name: 'Class 1',
    p_gender: 'Male',
    p_alternate_phone: null
  });
  console.log(error || "Success attach");
}

main();
