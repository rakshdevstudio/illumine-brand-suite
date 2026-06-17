import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data: variants, error: vErr } = await supabase.from('product_variants').select('id, product_id').limit(1);
  if (vErr || !variants || variants.length === 0) return;

  const { data, error } = await supabase.from("branch_inventory")
      .select("branch_id, variant_id, quantity, branch:branches(name)")
      .in("variant_id", [variants[0].id]);

  console.log(error || "Success fetch stock");
}

main();
