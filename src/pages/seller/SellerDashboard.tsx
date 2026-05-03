/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  IndianRupee,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Truck,
  Wallet,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PortalMetricCard, PortalShell, portalPanelClassName } from "@/components/dashboard/PortalShell";
import { formatCurrency, formatShortDate } from "@/lib/portal-dashboard";
import { isLowStock } from "@/lib/inventory";
import { cn } from "@/lib/utils";

type SellerStatus = "pending_approval" | "active" | "suspended" | "rejected";
type SellerProductStatus = "draft" | "submitted" | "approved" | "rejected" | "changes_requested";
type SellerOrderStatus = "new" | "packed" | "ready_to_dispatch" | "shipped" | "delivered" | "returned" | "cancelled";

type VariantDraft = {
  tempId: string;
  size: string;
  color: string;
  sku: string;
  price: string;
  stock: string;
  lowStockThreshold: string;
};

const statusStyles: Record<string, string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  changes_requested: "border-amber-200 bg-amber-50 text-amber-700",
  pending_approval: "border-amber-200 bg-amber-50 text-amber-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  suspended: "border-red-200 bg-red-50 text-red-700",
  new: "border-blue-200 bg-blue-50 text-blue-700",
  packed: "border-amber-200 bg-amber-50 text-amber-700",
  ready_to_dispatch: "border-violet-200 bg-violet-50 text-violet-700",
  shipped: "border-indigo-200 bg-indigo-50 text-indigo-700",
  delivered: "border-emerald-200 bg-emerald-50 text-emerald-700",
  returned: "border-rose-200 bg-rose-50 text-rose-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  paid: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const fulfillmentStatuses: SellerOrderStatus[] = [
  "new",
  "packed",
  "ready_to_dispatch",
  "shipped",
  "delivered",
  "returned",
];

const statusLabel = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const createVariantDraft = (): VariantDraft => ({
  tempId: crypto.randomUUID(),
  size: "",
  color: "",
  sku: "",
  price: "",
  stock: "0",
  lowStockThreshold: "5",
});

const toNumber = (value: unknown) => Number(value ?? 0) || 0;

const makeMonthKey = (date: string) =>
  new Date(date).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

const generateBarcode = (name: string, size: string) => {
  const prefix = name
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, "X");
  return `ILL-${prefix}-${String(size || "STD").replace(/[^a-z0-9]/gi, "").toUpperCase()}-${Date.now().toString().slice(-6)}`;
};

const emptyProductForm = {
  name: "",
  category: "",
  schoolId: "",
  classId: "",
  gender: "Unisex",
  price: "",
  description: "",
  imageUrl: "",
};

const MarketplaceBadge = ({ value }: { value: string }) => (
  <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[10px] font-medium", statusStyles[value] ?? statusStyles.draft)}>
    {statusLabel(value)}
  </Badge>
);

type SellerDashboardProps = {
  initialTab?: "overview" | "products" | "orders" | "payouts" | "profile";
};

const SellerDashboard = ({ initialTab = "overview" }: SellerDashboardProps) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user, isSeller, hasAccess, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [variantDrafts, setVariantDrafts] = useState<VariantDraft[]>([createVariantDraft()]);
  const [productSearch, setProductSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<"all" | SellerOrderStatus>("all");
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [bulkStockValue, setBulkStockValue] = useState("0");
  const [stockReason, setStockReason] = useState("Seller stock adjustment");
  const [profileForm, setProfileForm] = useState({
    businessName: "",
    ownerName: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
    bankName: "",
    accountNumber: "",
    ifsc: "",
    upiId: "",
    gstCertificateUrl: "",
    cancelledChequeUrl: "",
  });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const { data: sellerContext, isLoading: sellerLoading } = useQuery({
    queryKey: ["seller-context", user?.id],
    enabled: !!user && hasAccess && isSeller,
    queryFn: async () => {
      const { data: sellerId, error: sellerIdError } = await (supabase as any).rpc("current_seller_id_any_status");
      if (sellerIdError) throw sellerIdError;
      if (!sellerId) return null;

      const { data: seller, error: sellerError } = await (supabase as any)
        .from("sellers")
        .select("id, name, email, phone, status, commission_rate, is_active, onboarding_notes, gstin, metadata")
        .eq("id", sellerId)
        .single();
      if (sellerError) throw sellerError;
      return seller as any;
    },
    staleTime: 30_000,
  });

  const sellerId = sellerContext?.id ?? null;
  const sellerActive = sellerContext?.status === "active" && sellerContext?.is_active !== false;

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["seller-products", sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_products")
        .select("*, schools(name), classes(name), seller_product_variants(*), seller_product_images(*)")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["seller-orders", sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_order_items")
        .select("*, orders(id, customer_name, phone, address, city, pincode, total_amount, status, created_at, schools(name), invoices(id, invoice_number, status)), products(name, school_id), product_variants(size, sku, barcode)")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: payouts = [], isLoading: payoutsLoading } = useQuery({
    queryKey: ["seller-payouts", sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_payouts")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["seller-notifications", sellerId],
    enabled: !!sellerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("seller_notifications")
        .select("*")
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["seller-schools"],
    enabled: sellerActive,
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["seller-classes"],
    enabled: sellerActive,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("id, name, school_id").eq("status", "active").order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const metrics = useMemo(() => {
    const grossSales = orders.reduce((sum: number, row: any) => sum + toNumber(row.gross_amount), 0);
    const commission = orders.reduce((sum: number, row: any) => sum + toNumber(row.commission_amount), 0);
    const netPayable = orders.reduce((sum: number, row: any) => sum + toNumber(row.net_amount), 0);
    const paidAmount = payouts.filter((row: any) => row.status === "paid").reduce((sum: number, row: any) => sum + toNumber(row.paid_amount), 0);
    const pendingPayout = payouts
      .filter((row: any) => row.status === "pending" || row.status === "processing")
      .reduce((sum: number, row: any) => sum + toNumber(row.net_payable), 0);
    const lowStockCount = products.reduce(
      (sum: number, product: any) =>
        sum +
        (product.seller_product_variants ?? []).filter((variant: any) =>
          isLowStock(toNumber(variant.stock), toNumber(variant.low_stock_threshold || 5)),
        ).length,
      0,
    );
    const pendingOrders = orders.filter((row: any) => row.fulfillment_status === "new").length;
    const shippedOrders = orders.filter((row: any) => ["shipped", "delivered"].includes(row.fulfillment_status)).length;
    const returnedOrders = orders.filter((row: any) => row.fulfillment_status === "returned").length;
    const cancelledOrders = orders.filter((row: any) => row.fulfillment_status === "cancelled").length;
    const deliveredOrders = orders.filter((row: any) => row.fulfillment_status === "delivered").length;
    
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter((row: any) => row.created_at.startsWith(todayStr)).length;
    const productsLive = products.filter((p: any) => p.approval_status === "approved" && p.listing_enabled).length;

    return {
      grossSales,
      commission,
      netPayable,
      paidAmount,
      pendingPayout,
      lowStockCount,
      pendingOrders,
      shippedOrders,
      totalOrders: orders.length,
      todayOrders,
      productsLive,
      returnRate: orders.length ? Math.round((returnedOrders / orders.length) * 100) : 0,
      cancellationRate: orders.length ? Math.round((cancelledOrders / orders.length) * 100) : 0,
      conversionRate: products.length ? Math.round((deliveredOrders / Math.max(products.length * 12, 1)) * 100) : 0,
    };
  }, [orders, payouts, products]);

  const analytics = useMemo(() => {
    const productSales = new Map<string, { name: string; quantity: number; revenue: number }>();
    const monthly = new Map<string, { month: string; revenue: number; orders: number }>();

    orders.forEach((row: any) => {
      const productName = row.products?.name ?? "Product";
      const current = productSales.get(row.product_id) ?? { name: productName, quantity: 0, revenue: 0 };
      current.quantity += 1;
      current.revenue += toNumber(row.gross_amount);
      productSales.set(row.product_id, current);

      const month = makeMonthKey(row.created_at);
      const trend = monthly.get(month) ?? { month, revenue: 0, orders: 0 };
      trend.revenue += toNumber(row.gross_amount);
      trend.orders += 1;
      monthly.set(month, trend);
    });

    return {
      bestSellers: [...productSales.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6),
      trend: [...monthly.values()].slice(-8),
    };
  }, [orders]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product: any) =>
      [product.name, product.category, product.schools?.name, product.classes?.name].join(" ").toLowerCase().includes(query),
    );
  }, [products, productSearch]);

  const filteredOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    const source = orderStatusFilter === "all" ? orders : orders.filter((row: any) => row.fulfillment_status === orderStatusFilter);
    if (!query) return source;
    return source.filter((row: any) =>
      [row.orders?.customer_name, row.orders?.phone, row.products?.name, row.product_variants?.size, row.fulfillment_status]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [orders, orderSearch, orderStatusFilter]);

  const filteredClasses = classes.filter((item: any) => !productForm.schoolId || item.school_id === productForm.schoolId);

  const resetProductForm = () => {
    setProductForm(emptyProductForm);
    setVariantDrafts([createVariantDraft()]);
  };

  const createProduct = useMutation({
    mutationFn: async (submitAfterCreate: boolean) => {
      if (!sellerId) throw new Error("Seller account not resolved");
      if (!productForm.name.trim()) throw new Error("Product name is required");
      if (!productForm.category.trim()) throw new Error("Category is required");
      if (!productForm.schoolId) throw new Error("School mapping is required");
      if (!variantDrafts.some((variant) => variant.size.trim())) throw new Error("At least one size variant is required");

      const { data: sellerProduct, error: productError } = await (supabase as any)
        .from("seller_products")
        .insert({
          seller_id: sellerId,
          name: productForm.name.trim(),
          category: productForm.category.trim(),
          school_id: productForm.schoolId,
          class_id: productForm.classId || null,
          gender: productForm.gender,
          description: productForm.description.trim() || null,
          base_price: toNumber(productForm.price),
          image_url: productForm.imageUrl.trim() || null,
          approval_status: "draft",
          listing_enabled: false,
          created_by: user?.id ?? null,
        })
        .select("*")
        .single();
      if (productError) throw productError;

      const variantRows = variantDrafts
        .filter((variant) => variant.size.trim())
        .map((variant) => ({
          seller_product_id: sellerProduct.id,
          size: variant.size.trim(),
          color: variant.color.trim() || null,
          sku: variant.sku.trim() || null,
          barcode: generateBarcode(productForm.name, variant.size),
          price: variant.price ? toNumber(variant.price) : null,
          stock: toNumber(variant.stock),
          low_stock_threshold: toNumber(variant.lowStockThreshold || 5),
          status: "active",
        }));

      const { error: variantError } = await (supabase as any).from("seller_product_variants").insert(variantRows);
      if (variantError) throw variantError;

      if (productForm.imageUrl.trim()) {
        await (supabase as any).from("seller_product_images").insert({
          seller_product_id: sellerProduct.id,
          image_url: productForm.imageUrl.trim(),
          is_primary: true,
        });
      }

      if (submitAfterCreate) {
        const { error: submitError } = await (supabase as any).rpc("submit_seller_product", {
          p_seller_product_id: sellerProduct.id,
        });
        if (submitError) throw submitError;
      }

      return sellerProduct;
    },
    onSuccess: async (_data, submitAfterCreate) => {
      toast.success(submitAfterCreate ? "Product submitted for Illume approval." : "Draft product created.");
      resetProductForm();
      setProductDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["seller-products", sellerId] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to save product."),
  });

  const submitProduct = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await (supabase as any).rpc("submit_seller_product", { p_seller_product_id: productId });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Product submitted for approval.");
      await queryClient.invalidateQueries({ queryKey: ["seller-products", sellerId] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to submit product."),
  });

  const updateFulfillment = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: SellerOrderStatus }) => {
      const { error } = await (supabase as any).rpc("update_seller_fulfillment", {
        p_seller_order_item_id: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Fulfillment updated.");
      await queryClient.invalidateQueries({ queryKey: ["seller-orders", sellerId] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to update fulfillment."),
  });

  const updateStock = useMutation({
    mutationFn: async ({ variantId, stock }: { variantId: string; stock: number }) => {
      const { error } = await (supabase as any).rpc("update_seller_variant_stock", {
        p_seller_variant_id: variantId,
        p_new_stock: stock,
        p_reason: stockReason.trim() || "Seller stock adjustment",
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Stock updated and logged.");
      await queryClient.invalidateQueries({ queryKey: ["seller-products", sellerId] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to update stock."),
  });

  const updateProfile = useMutation({
    mutationFn: async () => {
      if (!sellerId) throw new Error("Seller account not resolved");
      const { error } = await (supabase as any).from("sellers").update({
        name: profileForm.businessName.trim() || null,
        phone: profileForm.phone.trim() || null,
        email: profileForm.email.trim() || null,
        gstin: profileForm.gstin.trim() || null,
        address: profileForm.address.trim() || null,
        metadata: {
          ...(sellerContext?.metadata ?? {}),
          owner_name: profileForm.ownerName.trim() || null,
          bank_name: profileForm.bankName.trim() || null,
          bank_account_number: profileForm.accountNumber.trim() || null,
          bank_ifsc: profileForm.ifsc.trim() || null,
          upi_id: profileForm.upiId.trim() || null,
          gst_certificate_url: profileForm.gstCertificateUrl.trim() || null,
          cancelled_cheque_url: profileForm.cancelledChequeUrl.trim() || null,
        },
      }).eq("id", sellerId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Seller profile updated.");
      await queryClient.invalidateQueries({ queryKey: ["seller-context", user?.id] });
    },
    onError: (error: any) => toast.error(error.message || "Failed to update profile."),
  });

  const bulkUpdateStock = useMutation({
    mutationFn: async () => {
      const next = Math.max(0, toNumber(bulkStockValue));
      const variantIds = filteredProducts.flatMap((product: any) => (product.seller_product_variants ?? []).map((variant: any) => variant.id));
      if (!variantIds.length) return;
      for (const variantId of variantIds) {
        const { error } = await (supabase as any).rpc("update_seller_variant_stock", {
          p_seller_variant_id: variantId,
          p_new_stock: next,
          p_reason: stockReason.trim() || "Seller bulk stock update",
        });
        if (error) throw error;
      }
    },
    onSuccess: async () => {
      toast.success("Bulk stock update completed.");
      await queryClient.invalidateQueries({ queryKey: ["seller-products", sellerId] });
    },
    onError: (error: any) => toast.error(error.message || "Failed bulk stock update."),
  });

  useEffect(() => {
    if (!sellerContext) return;
    setProfileForm({
      businessName: sellerContext?.name ?? "",
      ownerName: sellerContext?.metadata?.owner_name ?? "",
      phone: sellerContext?.phone ?? "",
      email: sellerContext?.email ?? "",
      gstin: sellerContext?.gstin ?? "",
      address: sellerContext?.address ?? "",
      bankName: sellerContext?.metadata?.bank_name ?? "",
      accountNumber: sellerContext?.metadata?.bank_account_number ?? "",
      ifsc: sellerContext?.metadata?.bank_ifsc ?? "",
      upiId: sellerContext?.metadata?.upi_id ?? "",
      gstCertificateUrl: sellerContext?.metadata?.gst_certificate_url ?? "",
      cancelledChequeUrl: sellerContext?.metadata?.cancelled_cheque_url ?? "",
    });
  }, [sellerContext]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user || !hasAccess || !isSeller) {
    return <Navigate to="/seller/login" replace />;
  }

  if (sellerLoading) {
    return (
      <PortalShell title="Seller Dashboard" subtitle={user.email ?? "Seller portal"} onSignOut={signOut}>
        <Card className={portalPanelClassName}>
          <CardContent className="p-8 text-sm text-muted-foreground">Resolving seller workspace...</CardContent>
        </Card>
      </PortalShell>
    );
  }

  if (!sellerContext) {
    return (
      <PortalShell title="Seller Dashboard" subtitle={user.email ?? "Seller portal"} onSignOut={signOut}>
        <Card className={portalPanelClassName}>
          <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p>No seller workspace is linked to this login yet. Illume admin must invite or map this user to a seller.</p>
          </CardContent>
        </Card>
      </PortalShell>
    );
  }

  return (
    <PortalShell
      title="Seller Dashboard"
      subtitle={sellerContext.name ?? user.email ?? "Marketplace seller"}
      onSignOut={signOut}
      scopeLabel={`${statusLabel(sellerContext.status as SellerStatus)} · ${toNumber(sellerContext.commission_rate)}% commission`}
    >
      {!sellerActive ? (
        <Card className={portalPanelClassName}>
          <CardContent className="flex items-start gap-3 p-6 text-sm text-muted-foreground">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-foreground">Your seller account is {statusLabel(sellerContext.status)}.</p>
              <p className="mt-1">Product submission, fulfillment, and payouts unlock after Illume approval.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const next = value as typeof activeTab;
          setActiveTab(next);
          const routeMap: Record<string, string> = {
            overview: "/seller/dashboard",
            products: "/seller/products",
            orders: "/seller/orders",
            payouts: "/seller/payouts",
            profile: "/seller/profile",
          };
          navigate(routeMap[next] ?? "/seller/dashboard");
        }}
        className="space-y-6"
      >
        <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-[24px] border border-black/5 bg-white/75 p-2 shadow-sm md:grid-cols-7">
          <TabsTrigger value="overview" className="rounded-2xl"><BarChart3 className="mr-2 h-4 w-4" />Home</TabsTrigger>
          <TabsTrigger value="products" className="rounded-2xl"><Package className="mr-2 h-4 w-4" />Products</TabsTrigger>
          <TabsTrigger value="orders" className="rounded-2xl"><Truck className="mr-2 h-4 w-4" />Orders</TabsTrigger>
          <TabsTrigger value="payouts" className="rounded-2xl"><Wallet className="mr-2 h-4 w-4" />Payouts</TabsTrigger>
          <TabsTrigger value="profile" className="rounded-2xl"><Wallet className="mr-2 h-4 w-4" />Profile</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <PortalMetricCard label="Total Sales" value={ordersLoading ? "..." : formatCurrency(metrics.grossSales)} icon={<IndianRupee className="h-4 w-4" />} />
            <PortalMetricCard label="Today Orders" value={ordersLoading ? "..." : metrics.todayOrders} icon={<ShoppingBag className="h-4 w-4" />} />
            <PortalMetricCard label="Pending Orders" value={ordersLoading ? "..." : metrics.pendingOrders} icon={<Clock className="h-4 w-4" />} />
            <PortalMetricCard label="Products Live" value={productsLoading ? "..." : metrics.productsLive} icon={<PackageCheck className="h-4 w-4" />} />
            <PortalMetricCard label="Pending Payout" value={payoutsLoading ? "..." : formatCurrency(metrics.pendingPayout)} icon={<Wallet className="h-4 w-4" />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <Card className={portalPanelClassName}>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={analytics.trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d7" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={72} />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Line type="monotone" dataKey="revenue" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className={portalPanelClassName}>
              <CardHeader>
                <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Best Selling Products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analytics.bestSellers.length ? analytics.bestSellers.map((product) => (
                  <div key={product.name} className="flex items-center justify-between gap-4 rounded-2xl border border-black/5 bg-stone-50/80 p-4">
                    <div>
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.quantity} order lines</p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(product.revenue)}</p>
                  </div>
                )) : (
                  <p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">Best sellers appear after seller order items are assigned.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <Card className={portalPanelClassName}>
            <CardHeader><CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Recent Orders</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Customer</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                <TableBody>
                  {orders.slice(0, 6).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.orders?.id?.slice(0, 8) ?? "-"}</TableCell>
                      <TableCell>{row.orders?.customer_name ?? "-"}</TableCell>
                      <TableCell>{formatCurrency(toNumber(row.gross_amount))}</TableCell>
                      <TableCell>{formatShortDate(row.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="rounded-full bg-white pl-9" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products" />
            </div>
            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!sellerActive} className="rounded-full"><Plus className="mr-2 h-4 w-4" />Add Product</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-[28px]">
                <DialogHeader>
                  <DialogTitle>Create Seller Product</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label>Name</Label><Input value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Category</Label><Input value={productForm.category} onChange={(e) => setProductForm((p) => ({ ...p, category: e.target.value }))} /></div>
                  <div className="space-y-2">
                    <Label>School</Label>
                    <Select value={productForm.schoolId} onValueChange={(value) => setProductForm((p) => ({ ...p, schoolId: value, classId: "" }))}>
                      <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
                      <SelectContent>{schools.map((school: any) => <SelectItem key={school.id} value={school.id}>{school.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select value={productForm.classId || "none"} onValueChange={(value) => setProductForm((p) => ({ ...p, classId: value === "none" ? "" : value }))}>
                      <SelectTrigger><SelectValue placeholder="Optional class" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No class mapping</SelectItem>
                        {filteredClasses.map((schoolClass: any) => <SelectItem key={schoolClass.id} value={schoolClass.id}>{schoolClass.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={productForm.gender} onValueChange={(value) => setProductForm((p) => ({ ...p, gender: value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Male", "Female", "Unisex"].map((gender) => <SelectItem key={gender} value={gender}>{gender}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Base Price</Label><Input type="number" value={productForm.price} onChange={(e) => setProductForm((p) => ({ ...p, price: e.target.value }))} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Image URL</Label><Input value={productForm.imageUrl} onChange={(e) => setProductForm((p) => ({ ...p, imageUrl: e.target.value }))} placeholder="https://..." /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Description</Label><Textarea value={productForm.description} onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} /></div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Variants</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => setVariantDrafts((prev) => [...prev, createVariantDraft()])}>Add Variant</Button>
                  </div>
                  {variantDrafts.map((variant, index) => (
                    <div key={variant.tempId} className="grid gap-3 rounded-2xl border border-border p-3 md:grid-cols-6">
                      {[
                        ["size", "Size"],
                        ["color", "Color"],
                        ["sku", "SKU"],
                        ["price", "Price"],
                        ["stock", "Stock"],
                        ["lowStockThreshold", "Low"],
                      ].map(([field, label]) => (
                        <div key={field} className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-[0.18em]">{label}</Label>
                          <Input
                            type={["price", "stock", "lowStockThreshold"].includes(field) ? "number" : "text"}
                            value={(variant as any)[field]}
                            onChange={(event) => setVariantDrafts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: event.target.value } : item))}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" disabled={createProduct.isPending} onClick={() => createProduct.mutate(false)}>Save Draft</Button>
                  <Button disabled={createProduct.isPending} onClick={() => createProduct.mutate(true)}>
                    {createProduct.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Submit For Approval
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Bulk Stock Qty</Label>
              <Input className="w-40" type="number" min={0} value={bulkStockValue} onChange={(e) => setBulkStockValue(e.target.value)} />
            </div>
            <Button variant="outline" onClick={() => bulkUpdateStock.mutate()} disabled={bulkUpdateStock.isPending}>
              Apply To Filtered Variants
            </Button>
          </div>

          <Card className={portalPanelClassName}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Mapping</TableHead>
                    <TableHead>Variants</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product: any) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.category} · {formatCurrency(toNumber(product.base_price))}</div>
                      </TableCell>
                      <TableCell className="text-sm">{product.schools?.name ?? "School pending"}{product.classes?.name ? ` · ${product.classes.name}` : ""}</TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          {(product.seller_product_variants ?? []).map((variant: any) => (
                            <div key={variant.id} className="flex items-center gap-2 text-xs">
                              <span className="min-w-16 font-medium">{variant.size}</span>
                              <Input
                                className="h-8 w-20"
                                type="number"
                                defaultValue={variant.stock}
                                onBlur={(event) => {
                                  const next = toNumber(event.target.value);
                                  if (next !== toNumber(variant.stock)) updateStock.mutate({ variantId: variant.id, stock: next });
                                }}
                              />
                              {isLowStock(toNumber(variant.stock), toNumber(variant.low_stock_threshold || 5)) ? <Badge variant="outline" className={statusStyles.pending}>Low</Badge> : null}
                            </div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell><MarketplaceBadge value={product.approval_status as SellerProductStatus} /></TableCell>
                      <TableCell className="text-right">
                        {["draft", "changes_requested"].includes(product.approval_status) ? (
                          <Button size="sm" variant="outline" disabled={submitProduct.isPending} onClick={() => submitProduct.mutate(product.id)}>Submit</Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">{product.listing_enabled ? "Listing enabled" : "Awaiting Illume"}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!productsLoading && filteredProducts.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">No products yet.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Input className="max-w-md rounded-full bg-white" value={stockReason} onChange={(event) => setStockReason(event.target.value)} placeholder="Reason for stock changes" />
        </TabsContent>

        <TabsContent value="orders" className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="rounded-full bg-white pl-9" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Search orders" />
            </div>
            <Select value={orderStatusFilter} onValueChange={(value) => setOrderStatusFilter(value as "all" | SellerOrderStatus)}>
              <SelectTrigger className="w-52 rounded-full bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="packed">Packed</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className={portalPanelClassName}>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.orders?.id?.slice(0, 8) ?? "-"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{row.orders?.customer_name ?? "-"}</div>
                        <div className="text-xs text-muted-foreground">{row.orders?.phone ?? ""}</div>
                        <div className="text-xs text-muted-foreground">{[row.orders?.address, row.orders?.city, row.orders?.pincode].filter(Boolean).join(", ")}</div>
                      </TableCell>
                      <TableCell>{row.products?.name ?? "Product"} · {row.product_variants?.size ?? "Default"}</TableCell>
                      <TableCell>1</TableCell>
                      <TableCell>{formatCurrency(toNumber(row.gross_amount))}</TableCell>
                      <TableCell>{formatCurrency(toNumber(row.commission_amount))}</TableCell>
                      <TableCell>{formatCurrency(toNumber(row.net_amount))}</TableCell>
                      <TableCell>{formatShortDate(row.created_at)}</TableCell>
                      <TableCell>
                        <Select
                          value={row.fulfillment_status}
                          onValueChange={(value) => updateFulfillment.mutate({ id: row.id, status: value as SellerOrderStatus })}
                        >
                          <SelectTrigger className="h-9 w-44 rounded-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["packed", "shipped", "delivered"].map((status) => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setSelectedOrder(row)}>View</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!ordersLoading && filteredOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No seller orders assigned yet.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
            <DialogContent className="max-w-xl rounded-[28px]">
              <DialogHeader><DialogTitle>Order Details</DialogTitle></DialogHeader>
              {selectedOrder ? (
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Order ID:</span> {selectedOrder.orders?.id}</p>
                  <p><span className="text-muted-foreground">Customer:</span> {selectedOrder.orders?.customer_name ?? "-"}</p>
                  <p><span className="text-muted-foreground">Phone:</span> {selectedOrder.orders?.phone ?? "-"}</p>
                  <p><span className="text-muted-foreground">Address:</span> {[selectedOrder.orders?.address, selectedOrder.orders?.city, selectedOrder.orders?.pincode].filter(Boolean).join(", ") || "-"}</p>
                  <p><span className="text-muted-foreground">Item:</span> {selectedOrder.products?.name ?? "Product"} · {selectedOrder.product_variants?.size ?? "Default"}</p>
                  <p><span className="text-muted-foreground">Gross:</span> {formatCurrency(toNumber(selectedOrder.gross_amount))}</p>
                  <p><span className="text-muted-foreground">Commission:</span> {formatCurrency(toNumber(selectedOrder.commission_amount))}</p>
                  <p><span className="text-muted-foreground">Net:</span> {formatCurrency(toNumber(selectedOrder.net_amount))}</p>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="payouts" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            <PortalMetricCard label="Gross Sales" value={formatCurrency(metrics.grossSales)} icon={<IndianRupee className="h-4 w-4" />} />
            <PortalMetricCard label="Illume Commission" value={formatCurrency(metrics.commission)} icon={<PackageCheck className="h-4 w-4" />} />
            <PortalMetricCard label="Net Payable" value={formatCurrency(metrics.netPayable)} icon={<Wallet className="h-4 w-4" />} />
            <PortalMetricCard label="Pending Payout" value={formatCurrency(metrics.pendingPayout)} icon={<Clock className="h-4 w-4" />} />
            <PortalMetricCard label="Paid Amount" value={formatCurrency(metrics.paidAmount)} icon={<CheckCircle2 className="h-4 w-4" />} />
          </div>
          <Card className={portalPanelClassName}>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Payout</TableHead><TableHead>Period</TableHead><TableHead>Gross</TableHead><TableHead>Commission</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {payouts.map((payout: any) => (
                    <TableRow key={payout.id}>
                      <TableCell className="font-medium">{payout.payout_number}</TableCell>
                      <TableCell>{[payout.period_start, payout.period_end].filter(Boolean).join(" - ") || "Open settlement"}</TableCell>
                      <TableCell>{formatCurrency(toNumber(payout.gross_sales))}</TableCell>
                      <TableCell>{formatCurrency(toNumber(payout.commission_amount))}</TableCell>
                      <TableCell>{formatCurrency(toNumber(payout.net_payable))}</TableCell>
                      <TableCell><MarketplaceBadge value={payout.status} /></TableCell>
                    </TableRow>
                  ))}
                  {!payoutsLoading && payouts.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No payout settlements yet.</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile" className="space-y-6">
          <Card className={portalPanelClassName}>
            <CardHeader>
              <CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Seller Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Business Name</Label><Input value={profileForm.businessName} onChange={(e) => setProfileForm((p) => ({ ...p, businessName: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Owner Name</Label><Input value={profileForm.ownerName} onChange={(e) => setProfileForm((p) => ({ ...p, ownerName: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={profileForm.phone} onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={profileForm.email} onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))} /></div>
              <div className="space-y-2"><Label>GSTIN</Label><Input value={profileForm.gstin} onChange={(e) => setProfileForm((p) => ({ ...p, gstin: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Address</Label><Input value={profileForm.address} onChange={(e) => setProfileForm((p) => ({ ...p, address: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Bank Name</Label><Input value={profileForm.bankName} onChange={(e) => setProfileForm((p) => ({ ...p, bankName: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Account Number</Label><Input value={profileForm.accountNumber} onChange={(e) => setProfileForm((p) => ({ ...p, accountNumber: e.target.value }))} /></div>
              <div className="space-y-2"><Label>IFSC</Label><Input value={profileForm.ifsc} onChange={(e) => setProfileForm((p) => ({ ...p, ifsc: e.target.value }))} /></div>
              <div className="space-y-2"><Label>UPI ID</Label><Input value={profileForm.upiId} onChange={(e) => setProfileForm((p) => ({ ...p, upiId: e.target.value }))} /></div>
              <div className="space-y-2"><Label>GST Certificate URL (optional)</Label><Input value={profileForm.gstCertificateUrl} onChange={(e) => setProfileForm((p) => ({ ...p, gstCertificateUrl: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Cancelled Cheque URL (optional)</Label><Input value={profileForm.cancelledChequeUrl} onChange={(e) => setProfileForm((p) => ({ ...p, cancelledChequeUrl: e.target.value }))} /></div>
              <div className="md:col-span-2">
                <Button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}>Save Profile</Button>
              </div>
            </CardContent>
          </Card>
          <Card className={portalPanelClassName}>
            <CardHeader><CardTitle className="text-sm font-medium uppercase tracking-[0.22em] text-muted-foreground">Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {notifications.length ? notifications.slice(0, 5).map((notification: any) => (
                <div key={notification.id} className="rounded-2xl border border-black/5 bg-stone-50/80 p-4">
                  <p className="font-medium">{notification.title}</p>
                  <p className="text-sm text-muted-foreground">{notification.body}</p>
                </div>
              )) : <p className="text-sm text-muted-foreground">No notifications yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PortalShell>
  );
};

export default SellerDashboard;
