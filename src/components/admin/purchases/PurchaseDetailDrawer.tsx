import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Loader2, OctagonX } from "lucide-react";
import { ConfirmVoidPurchaseModal } from "@/components/admin/purchases/ConfirmVoidPurchaseModal";
import { useVoidPurchase } from "@/hooks/useVoidPurchase";

// Type definition for the detailed purchase data
export type DetailedPurchase = {
  id: string;
  purchase_number: string;
  status: string;
  purchase_date: string;
  notes: string | null;
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  vendors: { name: string } | null;
  branches: { name: string } | null;
  purchase_items: {
    quantity: number;
    unit_cost: number;
    gst_percentage: number;
    line_total: number;
    product_variants: {
      sku: string;
      size: string;
      products: {
        name: string;
        schools: { name: string } | null;
        classes: { name: string } | null;
      } | null;
    } | null;
  }[];
};

// Helper to fetch detailed purchase data
const fetchPurchaseDetails = async (purchaseId: string): Promise<DetailedPurchase> => {
  const { data, error } = await (supabase as any)
    .from("purchases")
    .select(
      `
      id,
      purchase_number,
      status,
      purchase_date,
      notes,
      subtotal,
      cgst,
      sgst,
      igst,
      total,
      created_by,
      created_at,
      updated_at,
      vendors ( name ),
      branches ( name ),
      purchase_items (
        quantity,
        unit_cost,
        gst_percentage,
        line_total,
        product_variants (
          sku,
          size,
          products (
            name,
            schools ( name ),
            classes ( name )
          )
        )
      )
    `
    )
    .eq("id", purchaseId)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as DetailedPurchase;
};

// Formatter for currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
};

// The main component for the drawer
export function PurchaseDetailDrawer({
  purchaseId,
  isOpen,
  onOpenChange,
}: {
  purchaseId: string | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const [confirmVoidOpen, setConfirmVoidOpen] = useState(false);
  const {
    data: purchase,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["purchaseDetails", purchaseId],
    queryFn: () => fetchPurchaseDetails(purchaseId!),
    enabled: !!purchaseId && isOpen, // Only fetch when a purchaseId is provided and the drawer is open
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  const { voidPurchase, isVoiding } = useVoidPurchase({
    purchaseId,
    onSuccess: () => setConfirmVoidOpen(false),
  });

  const renderContent = () => {
    if (isLoading) {
      return <PurchaseDetailSkeleton />;
    }

    if (error) {
      return <div className="p-6 text-destructive">Failed to load purchase details: {error.message}</div>;
    }

    if (!purchase) {
      return null;
    }

    const lineItems = purchase.purchase_items || [];
    const isVoided = purchase.status?.toLowerCase() === "voided";

    return (
      <ScrollArea className="h-[calc(100vh-8rem)]">
        <div className="p-6 space-y-6">
          {isVoided && (
            <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-rose-900 shadow-sm">
              <OctagonX className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">This purchase has been voided.</p>
                <p className="text-xs leading-5 text-rose-800/90">
                  Inventory and accounting impact were reversed while preserving this purchase for audit review.
                </p>
              </div>
            </div>
          )}

          {/* Section 1: Header */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
            <div>
              <p className="text-sm text-muted-foreground">Vendor</p>
              <p className="font-semibold">{purchase.vendors?.name ?? "N/A"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Branch</p>
              <p className="font-semibold">{purchase.branches?.name ?? "N/A"}</p>
            </div>
          </div>

          {/* Section 2: Financial Summary */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Subtotal</p>
              <p className={cn("text-lg font-bold", isVoided && "text-muted-foreground line-through")}>
                {formatCurrency(purchase.subtotal)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tax</p>
              <p className={cn("text-lg font-bold", isVoided && "text-muted-foreground line-through")}>
                {formatCurrency((purchase.cgst || 0) + (purchase.sgst || 0) + (purchase.igst || 0))}
              </p>
            </div>
            <div className={cn("rounded-md bg-primary/10 p-2", isVoided && "bg-rose-50")}>
              <p className={cn("text-sm text-primary", isVoided && "text-rose-700")}>Total</p>
              <p className={cn("text-xl font-extrabold text-primary", isVoided && "text-rose-700 line-through")}>
                {formatCurrency(purchase.total)}
              </p>
            </div>
          </div>

          {/* Section 3: Items Table */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Items ({lineItems.length})</h3>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>School</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">GST %</TableHead>
                    <TableHead className="text-right">Line Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => {
                    const product = item.product_variants?.products;
                    const variant = item.product_variants;
                    const lineTotal = Number(item.line_total ?? item.quantity * item.unit_cost * (1 + item.gst_percentage / 100));
                    const schoolName = product?.schools?.name ?? "Global";
                    const className = product?.classes?.name;

                    const identityParts = [
                        schoolName,
                        className,
                        variant?.size ? `Size ${variant.size}` : null,
                        variant?.sku ? `SKU ${variant.sku}` : null,
                    ].filter(Boolean);


                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <p className="font-semibold">{product?.name ?? "Unknown Product"}</p>
                          <p className="text-xs text-muted-foreground">{identityParts.join(" | ")}</p>
                        </TableCell>
                        <TableCell>{schoolName}</TableCell>
                        <TableCell>{className ?? "-"}</TableCell>
                        <TableCell>{variant?.size || variant?.sku ? [variant?.size ? `Size ${variant.size}` : null, variant?.sku ? `SKU ${variant.sku}` : null].filter(Boolean).join(" • ") : "-"}</TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_cost)}</TableCell>
                        <TableCell className="text-right">{item.gst_percentage}%</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(lineTotal)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Section 6: Notes */}
          {purchase.notes && (
            <div>
              <h3 className="text-lg font-semibold">Notes</h3>
              <p className="text-sm text-muted-foreground p-4 bg-muted/50 rounded-md">{purchase.notes}</p>
            </div>
          )}

          {/* Section 7: Meta Info */}
          <div className="text-xs text-muted-foreground border-t pt-4 flex justify-between">
            <p>Created: {format(new Date(purchase.created_at), "dd MMM yyyy, hh:mm a")}</p>
            <p>Last Updated: {format(new Date(purchase.updated_at), "dd MMM yyyy, hh:mm a")}</p>
          </div>
        </div>
      </ScrollArea>
    );
  };

  const normalizedStatus = purchase?.status?.toLowerCase() ?? "";

  return (
    <>
      <ConfirmVoidPurchaseModal
        open={confirmVoidOpen}
        onOpenChange={setConfirmVoidOpen}
        purchaseNumber={purchase?.purchase_number ?? "Purchase"}
        total={purchase?.total ?? 0}
        isVoiding={isVoiding}
        onConfirm={voidPurchase}
      />
      <Drawer
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (isVoiding && !nextOpen) return;
          if (!nextOpen) setConfirmVoidOpen(false);
          onOpenChange(nextOpen);
        }}
        direction="right"
      >
        <DrawerContent className="w-full max-w-2xl mt-0 h-full ml-auto">
          <DrawerHeader className="p-6 border-b sticky top-0 bg-background z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <DrawerTitle className="text-2xl flex items-center gap-3">
                  <span>{purchase ? purchase.purchase_number : "Purchase Details"}</span>
                  {purchase && (
                    <Badge
                      className={cn("capitalize", {
                        "bg-green-100 text-green-800": normalizedStatus === "received",
                        "bg-yellow-100 text-yellow-800": normalizedStatus === "pending",
                        "bg-red-100 text-red-800": normalizedStatus === "cancelled",
                        "bg-rose-100 text-rose-800": normalizedStatus === "voided",
                      })}
                    >
                      {purchase.status}
                    </Badge>
                  )}
                </DrawerTitle>
                <DrawerDescription>
                  {purchase ? `Purchased on ${format(new Date(purchase.purchase_date), "dd MMMM yyyy")}` : "Loading purchase details"}
                </DrawerDescription>
              </div>

              {purchase && normalizedStatus !== "voided" && (
                <Button
                  type="button"
                  variant="destructive"
                  className="rounded-full shadow-sm"
                  onClick={() => setConfirmVoidOpen(true)}
                  disabled={isVoiding}
                  aria-label={`Void purchase ${purchase.purchase_number}`}
                >
                  {isVoiding ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Voiding...
                    </>
                  ) : (
                    "Void"
                  )}
                </Button>
              )}
            </div>
            {!purchase && (
              <div className="mt-3 space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            )}
          </DrawerHeader>
          {renderContent()}
        </DrawerContent>
      </Drawer>
    </>
  );
}

// Skeleton loader for the detail view
const PurchaseDetailSkeleton = () => (
  <div className="p-6 space-y-6">
    <div className="grid grid-cols-2 gap-4 rounded-lg border p-4">
      <div>
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-6 w-32" />
      </div>
      <div>
        <Skeleton className="h-4 w-20 mb-2" />
        <Skeleton className="h-6 w-32" />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
    <div>
      <Skeleton className="h-8 w-32 mb-2" />
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  </div>
);
