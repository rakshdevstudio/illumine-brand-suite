import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAuth } from "@/hooks/use-customer-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { LogOut, User, Package, ChevronDown, ChevronUp, GraduationCap, Pencil } from "lucide-react";

type OrderItem = {
  quantity: number;
  price: number;
  product_variants: {
    size: string | null;
    color: string | null;
    products: { name: string; image_url: string | null } | null;
  } | null;
};

type Order = {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  customer_name: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  order_items: OrderItem[];
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PLACED: { bg: "bg-yellow-50 border-yellow-200", text: "text-yellow-700" },
  PACKED: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700" },
  DISPATCHED: { bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-700" },
  DELIVERED: { bg: "bg-green-50 border-green-200", text: "text-green-700" },
  CANCELLED: { bg: "bg-red-50 border-red-200", text: "text-red-700" },
  pending:    { bg: "bg-yellow-50 border-yellow-200",  text: "text-yellow-700" },
  confirmed:  { bg: "bg-blue-50 border-blue-200",     text: "text-blue-700"   },
  processing: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700" },
  shipped:    { bg: "bg-indigo-50 border-indigo-200", text: "text-indigo-700" },
  delivered:  { bg: "bg-green-50 border-green-200",   text: "text-green-700"  },
  cancelled:  { bg: "bg-red-50 border-red-200",       text: "text-red-700"    },
};

const normalizeOrderStatus = (status: string) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "CONFIRMED") return "PACKED";
  if (normalized === "PENDING") return "PLACED";
  if (normalized === "SHIPPED") return "DISPATCHED";
  return normalized;
};

const formatPrice = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const StatusBadge = ({ status }: { status: string }) => {
  const normalizedStatus = normalizeOrderStatus(status);
  const c = STATUS_COLORS[normalizedStatus] ?? STATUS_COLORS.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] tracking-[0.12em] uppercase border rounded-sm font-medium ${c.bg} ${c.text}`}>
      {normalizedStatus}
    </span>
  );
};

const OrderCard = ({ order }: { order: Order }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-4 min-w-0">
          <Package className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs tracking-[0.15em] font-medium">
                #{order.id.slice(0, 8).toUpperCase()}
              </span>
              <StatusBadge status={order.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{formatDate(order.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <span className="text-sm font-light">{formatPrice(order.total_amount)}</span>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-border bg-muted/20">
          <div className="space-y-3 mt-4">
            {order.order_items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-3">
                {item.product_variants?.products?.image_url ? (
                  <img
                    src={item.product_variants.products.image_url}
                    alt={item.product_variants.products.name}
                    className="h-12 w-12 object-cover rounded-sm bg-muted shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 bg-muted rounded-sm shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-light truncate">
                    {item.product_variants?.products?.name ?? "Product"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[item.product_variants?.size, item.product_variants?.color]
                      .filter(Boolean).join(" · ")}
                    {" · "}Qty {item.quantity}
                  </p>
                </div>
                <span className="text-sm text-muted-foreground shrink-0">
                  {formatPrice(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          {(order.address || order.city) && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs tracking-[0.15em] uppercase text-muted-foreground mb-1">Delivery</p>
              <p className="text-xs text-foreground">
                {[order.address, order.city, order.pincode].filter(Boolean).join(", ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const AccountPage = () => {
  const navigate = useNavigate();
  const { user, customer, loading, signOut, updateProfile } = useCustomerAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch school name
  const { data: childSchool } = useQuery({
    queryKey: ["account-school", customer?.child_school_id],
    enabled: !!customer?.child_school_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("schools")
        .select("name, slug")
        .eq("id", customer!.child_school_id!)
        .single();
      return data;
    },
  });

  // Fetch class name
  const { data: childClass } = useQuery({
    queryKey: ["account-class", customer?.child_class_id],
    enabled: !!customer?.child_class_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("name, slug")
        .eq("id", customer!.child_class_id!)
        .single();
      return data;
    },
  });

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login?next=/store/account", { replace: true });
    }
  }, [loading, user, navigate]);

  // Sync form from customer profile
  useEffect(() => {
    if (customer) {
      setName(customer.name ?? "");
      setPhone(customer.phone ?? "");
    }
  }, [customer]);

  // Fetch orders
  useEffect(() => {
    if (!user) return;
    setOrdersLoading(true);
    supabase
      .from("orders")
      .select("id, status, total_amount, created_at, customer_name, address, city, pincode, order_items(quantity, price, product_variants(size, color, products(name, image_url)))")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders((data as unknown as Order[]) ?? []);
        setOrdersLoading(false);
      });
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { error } = await updateProfile({ name, phone });
    setSaving(false);
    if (error) {
      toast.error("Failed to save profile.");
    } else {
      toast.success("Profile updated.");
      setEditMode(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/store", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-xs tracking-[0.2em] text-muted-foreground animate-pulse uppercase">Loading…</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-12">
        <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase">My Account</h1>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">Sign Out</span>
        </button>
      </div>

      {/* Profile */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-xs tracking-[0.25em] uppercase text-muted-foreground">Profile</h2>
        </div>

        <div className="border border-border rounded-sm p-5">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground tracking-wide mb-1">Email</p>
            <p className="text-sm">{user.email}</p>
          </div>

          {!editMode ? (
            <>
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div>
                  <p className="text-xs text-muted-foreground tracking-wide mb-1">Name</p>
                  <p className="text-sm">{customer?.name || <span className="text-muted-foreground italic">Not set</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground tracking-wide mb-1">Phone</p>
                  <p className="text-sm">{customer?.phone || <span className="text-muted-foreground italic">Not set</span>}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}
                className="text-xs tracking-[0.15em] uppercase">
                Edit Profile
              </Button>
            </>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs tracking-[0.15em] text-muted-foreground uppercase block mb-2">Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" placeholder="Your name" />
                </div>
                <div>
                  <label className="text-xs tracking-[0.15em] text-muted-foreground uppercase block mb-2">Phone</label>
                  <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10" placeholder="+91 9972721666" />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={saving} size="sm" className="text-xs tracking-[0.15em] uppercase">
                  {saving ? "Saving…" : "Save"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditMode(false)}
                  className="text-xs tracking-[0.15em] uppercase">
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Child's School */}
      <section className="mb-12">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <GraduationCap className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-xs tracking-[0.25em] uppercase text-muted-foreground">Child's School</h2>
        </div>

        <div className="border border-border rounded-sm p-5">
          {customer?.child_school_id ? (
            <>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <div>
                  <p className="text-xs text-muted-foreground tracking-wide mb-1">School</p>
                  <p className="text-sm">{childSchool?.name ?? "…"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground tracking-wide mb-1">Class</p>
                  <p className="text-sm">{childClass?.name ?? "…"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground tracking-wide mb-1">Section</p>
                  <p className="text-sm capitalize">{customer.child_gender ?? "—"}</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Link to="/onboarding">
                  <Button variant="outline" size="sm" className="text-xs tracking-[0.15em] uppercase flex items-center gap-1.5">
                    <Pencil className="h-3 w-3" />
                    Change School
                  </Button>
                </Link>
                {childSchool && childClass && customer.child_gender && (
                  <Link to={`/store/school/${childSchool.slug}/class/${childClass.slug}/gender/${customer.child_gender}`}>
                    <Button size="sm" className="text-xs tracking-[0.15em] uppercase">
                      Shop Uniforms
                    </Button>
                  </Link>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-5">
                Add your child's school to see the right uniforms instantly.
              </p>
              <Link to="/onboarding">
                <Button size="sm" className="text-xs tracking-[0.15em] uppercase">
                  Add School
                </Button>
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Orders */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Package className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-xs tracking-[0.25em] uppercase text-muted-foreground">Order History</h2>
        </div>

        {ordersLoading ? (
          <p className="text-xs text-muted-foreground animate-pulse tracking-wide">Loading orders…</p>
        ) : orders.length === 0 ? (
          <div className="border border-border rounded-sm p-8 text-center">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-3" strokeWidth={1} />
            <p className="text-sm text-muted-foreground">No orders yet.</p>
            <Link to="/store" className="mt-4 inline-block text-xs tracking-[0.15em] uppercase underline underline-offset-2 hover:text-foreground text-muted-foreground">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default AccountPage;
