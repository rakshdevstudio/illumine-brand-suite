import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package, ShoppingCart, AlertTriangle, GraduationCap } from "lucide-react";

const DashboardPage = () => {
  const { data: schools } = useQuery({
    queryKey: ["admin-schools-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variants(*), schools(name)");
      if (error) throw error;
      return data;
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: allOrders } = useQuery({
    queryKey: ["admin-orders-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id");
      if (error) throw error;
      return data;
    },
  });

  const lowStockVariants = products?.flatMap((p) =>
    (p.product_variants ?? [])
      .filter((v: any) => v.stock <= 10)
      .map((v: any) => ({ ...v, productName: p.name, schoolName: (p as any).schools?.name }))
  ) ?? [];

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(price);

  return (
    <div>
      <h1 className="text-xl font-light tracking-[0.1em] uppercase mb-8">Dashboard</h1>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-6 mb-12">
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-normal">
              Total Schools
            </CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extralight">{schools?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-normal">
              Total Products
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extralight">{products?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-normal">
              Total Orders
            </CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extralight">{allOrders?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="border-border shadow-none">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs tracking-[0.2em] uppercase text-muted-foreground font-normal">
              Low Stock Alerts
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extralight">{lowStockVariants.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <div className="mb-12">
        <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-4">
          Recent Orders
        </h2>
        <div className="border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs tracking-wider uppercase">Order ID</TableHead>
                <TableHead className="text-xs tracking-wider uppercase">Customer</TableHead>
                <TableHead className="text-xs tracking-wider uppercase">Amount</TableHead>
                <TableHead className="text-xs tracking-wider uppercase">Status</TableHead>
                <TableHead className="text-xs tracking-wider uppercase">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No orders yet
                  </TableCell>
                </TableRow>
              )}
              {orders?.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="text-xs font-mono">
                    {order.id.slice(0, 8).toUpperCase()}
                  </TableCell>
                  <TableCell className="text-sm">{order.customer_name}</TableCell>
                  <TableCell className="text-sm">{formatPrice(order.total_amount)}</TableCell>
                  <TableCell>
                    <span className="text-xs tracking-wider uppercase px-2 py-1 border border-border">
                      {order.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Low Stock */}
      {lowStockVariants.length > 0 && (
        <div>
          <h2 className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-4">
            Low Stock Alerts
          </h2>
          <div className="border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs tracking-wider uppercase">Product</TableHead>
                  <TableHead className="text-xs tracking-wider uppercase">School</TableHead>
                  <TableHead className="text-xs tracking-wider uppercase">Size</TableHead>
                  <TableHead className="text-xs tracking-wider uppercase">Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockVariants.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="text-sm">{v.productName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.schoolName}</TableCell>
                    <TableCell className="text-sm">{v.size}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {v.stock === 0 ? (
                        <span className="text-destructive">Out of stock</span>
                      ) : (
                        <span>{v.stock} left</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;