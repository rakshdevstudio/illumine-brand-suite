import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { productId } = await req.json();

    if (!productId) {
      return new Response(JSON.stringify({ error: "productId is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 1. Archive the product variants first
    const { error: variantsError } = await supabase
      .from("product_variants")
      .update({ status: "archived" })
      .eq("product_id", productId);

    if (variantsError) {
      throw variantsError;
    }

    // 2. Archive the main product
    const { data, error } = await supabase
      .from("products")
      .update({ status: "archived" })
      .eq("id", productId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ product: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
