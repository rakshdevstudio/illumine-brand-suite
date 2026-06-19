import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BulkImportModal, type ImportRowResult } from "@/components/admin/BulkImportModal";

export default function DataImportPage() {
  const queryClient = useQueryClient();
  const [productModalOpen, setProductModalOpen] = useState(false);

  const { data: schools } = useQuery({
    queryKey: ["admin-schools-all"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id, name");
      return data || [];
    }
  });

  const { data: classes } = useQuery({
    queryKey: ["admin-classes-all"],
    queryFn: async () => {
      const { data } = await supabase.from("classes").select("id, name");
      return data || [];
    }
  });

  const { data: existingProducts } = useQuery({
    queryKey: ["admin-products-all"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, school_id, class_id, gender");
      return data || [];
    }
  });

  const { data: existingVariants } = useQuery({
    queryKey: ["admin-variants-all"],
    queryFn: async () => {
      const { data } = await supabase.from("product_variants").select("id, product_id, size");
      return data || [];
    }
  });

  const validateProductImport = async (rows: Record<string, unknown>[]): Promise<ImportRowResult[]> => {
    return rows.map((row) => {
      const messages: string[] = [];
      let status: "valid" | "warning" | "error" | "skip" = "valid";

      if (!row.Name) {
        messages.push("Missing Name");
        status = "error";
      }
      if (!row.Category) {
        messages.push("Missing Category");
        status = "error";
      }
      if (!row.Gender) {
        messages.push("Missing Gender");
        status = "error";
      }
      if (!row.Size) {
        messages.push("Missing Size");
        status = "error";
      }
      if (!row.BasePrice || isNaN(Number(row.BasePrice))) {
        messages.push("Invalid BasePrice");
        status = "error";
      }

      // Resolve School
      const school = schools?.find(s => s.name.toLowerCase() === String(row.School || "").toLowerCase());
      if (row.School && !school) {
        messages.push(`School '${row.School}' not found`);
        status = "error";
      }

      // Resolve Class
      const cls = classes?.find(c => c.name.toLowerCase() === String(row.Class || "").toLowerCase());
      if (row.Class && !cls) {
        messages.push(`Class '${row.Class}' not found`);
        status = "error";
      }

      // Check Duplicates
      const existingProduct = existingProducts?.find(p => 
        p.name.toLowerCase() === String(row.Name || "").toLowerCase() &&
        p.school_id === (school?.id || null) &&
        p.class_id === (cls?.id || null) &&
        p.gender.toLowerCase() === String(row.Gender || "").toLowerCase()
      );

      if (existingProduct) {
        const existingVariant = existingVariants?.find(v => 
          v.product_id === existingProduct.id &&
          v.size.toLowerCase() === String(row.Size || "").toLowerCase()
        );
        if (existingVariant) {
          status = "skip";
        } else {
          messages.push("Product exists, will add new size variant.");
        }
      }

      return {
        originalRow: { ...row, _schoolId: school?.id, _classId: cls?.id, _existingProductId: existingProduct?.id },
        status,
        messages
      };
    });
  };

  const importProducts = async (validRows: Record<string, unknown>[]) => {
    for (const row of validRows) {
      let productId = row._existingProductId as string | undefined;
      
      if (!productId) {
        // Create Product
        const { data: newProd, error: prodErr } = await supabase.from("products").insert({
          name: String(row.Name || ""),
          category: String(row.Category || ""),
          gender: String(row.Gender || ""),
          school_id: (row._schoolId as string) || null,
          class_id: (row._classId as string) || null,
          price: Number(row.BasePrice),
          base_price: Number(row.BasePrice),
          description: row.Description ? String(row.Description) : null,
        }).select("id").single();
        
        if (prodErr) throw prodErr;
        productId = newProd.id;

        // Auto assign
        if (row._schoolId && row._classId) {
          await supabase.from("product_assignments").upsert({
            product_id: productId,
            school_id: row._schoolId as string,
            class_id: row._classId as string,
            gender: String(row.Gender || ""),
            is_required: false,
            display_order: 0,
          }, { onConflict: "product_id,school_id,class_id,gender" });
        }
      }

      // Create Variant
      const { error: varErr } = await supabase.from("product_variants").insert({
        product_id: productId,
        size: String(row.Size || ""),
        price_override: row.PriceOverride ? Number(row.PriceOverride) : null,
        low_stock_threshold: row.LowStockThreshold ? Number(row.LowStockThreshold) : 5,
      });

      if (varErr) throw varErr;
    }

    toast.success(`Successfully imported ${validRows.length} variants/products`);
    queryClient.invalidateQueries({ queryKey: ["admin-products-list"] });
    queryClient.invalidateQueries({ queryKey: ["admin-products-all"] });
    queryClient.invalidateQueries({ queryKey: ["admin-variants-all"] });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Data Import</h2>
        <p className="text-muted-foreground">Bulk import data safely from CSV files. Duplicates are skipped by default.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Products & Variants</CardTitle>
            <CardDescription>Upload a CSV file to create new products or add sizes to existing ones.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setProductModalOpen(true)}>Import Products CSV</Button>
          </CardContent>
        </Card>
      </div>

      <BulkImportModal
        open={productModalOpen}
        onOpenChange={setProductModalOpen}
        title="Import Products"
        expectedColumns={["Name", "Category", "School", "Class", "Gender", "BasePrice", "Size", "PriceOverride", "LowStockThreshold", "Description"]}
        onValidate={validateProductImport}
        onImport={importProducts}
      />
    </div>
  );
}
