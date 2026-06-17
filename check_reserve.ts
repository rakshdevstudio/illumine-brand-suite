import { createClient } from '@supabase/supabase-js';

const url = "https://rkbkorssqydpetilwltc.supabase.co";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrYmtvcnNzcXlkcGV0aWx3bHRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxODcyODUsImV4cCI6MjA4ODc2MzI4NX0.qxf2vm1ozyQqRjCuqJEAUtZnxtB54WPTzI-geXmO6UA";

const supabase = createClient(url, key);

async function main() {
  const { data: variants, error: vErr } = await supabase.from('product_variants').select('id, product_id').limit(1);
  if (vErr || !variants || variants.length === 0) return;

  const { data: branch, error: bErr } = await supabase.from('branch_inventory').select('branch_id').eq('variant_id', variants[0].id).limit(1);
  if (bErr || !branch || branch.length === 0) return;

  const { data, error } = await supabase.rpc('reserve_checkout_inventory_movement', {
    p_variant_id: variants[0].id,
    p_product_id: variants[0].product_id,
    p_branch_id: branch[0].branch_id,
    p_quantity: 1,
    p_order_id: '0b25d0c3-f466-4260-a13b-2ce1720493c8'
  });
  console.log(error || "Success reserve");
}

main();
