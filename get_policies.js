const { createClient } = require('@supabase/supabase-js');
const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";
const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('orders').select('*').limit(1);
  console.log(error || "Success");
}
run();
