import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.rpc('run_sql', {
    sql: `SELECT pol.policyname, pol.permissive, pol.roles, pol.cmd, pol.qual, pol.with_check 
          FROM pg_policies pol 
          WHERE pol.tablename = 'orders'`
  });
  console.log(error || data);
}

main();
