import { Outlet, Navigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, ExternalLink, GraduationCap, Box, Layers, BookOpen, LogOut, Users, FlaskConical, AlertTriangle, BarChart3, History, Boxes, MessagesSquare, ReceiptText, UserRound, Truck, ShoppingBag, FileSpreadsheet, BookText, Wallet, Hourglass, Settings, UploadCloud, ActivitySquare } from "lucide-react";
import illumeLogo from "@/assets/logo.png";
import { NavLink } from "@/components/NavLink";
import AdminCommandPalette from "@/components/admin/AdminCommandPalette";
import { useAuth } from "@/hooks/use-auth";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard, minRole: "staff" as const },
  { title: "Activity Logs", url: "/admin/activity-logs", icon: History, minRole: "staff" as const },
  { title: "Schools", url: "/admin/schools", icon: GraduationCap, minRole: "staff" as const },
  { title: "Classes", url: "/admin/classes", icon: BookOpen, minRole: "staff" as const },
  { title: "Products", url: "/admin/products", icon: Box, minRole: "staff" as const },
  { title: "Variants", url: "/admin/product-variants", icon: Layers, minRole: "staff" as const },
  { title: "Inventory", url: "/admin/inventory", icon: Package, minRole: "staff" as const },
  { title: "Inventory Alerts", url: "/admin/inventory-alerts", icon: AlertTriangle, minRole: "staff" as const },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart, minRole: "staff" as const },
  { title: "Invoices", url: "/admin/invoices", icon: ReceiptText, minRole: "staff" as const },
  { title: "Customers", url: "/admin/customers", icon: Users, minRole: "staff" as const },
  { title: "Students", url: "/admin/students", icon: UserRound, minRole: "staff" as const },
  { title: "Suppliers", url: "/admin/suppliers", icon: Truck, minRole: "staff" as const },
  { title: "Sellers", url: "/admin/sellers", icon: ShoppingBag, minRole: "staff" as const },
  { title: "Purchases", url: "/admin/purchases", icon: ShoppingBag, minRole: "staff" as const },
  { title: "Ledger", url: "/admin/ledger", icon: BookText, minRole: "staff" as const },
  { title: "Contact Enquiries", url: "/admin/contact-enquiries", icon: MessagesSquare, minRole: "staff" as const },
  { title: "Users", url: "/admin/users", icon: Users, minRole: "admin" as const },
  { title: "Data Import", url: "/admin/import", icon: UploadCloud, minRole: "admin" as const },
  { title: "System Health", url: "/admin/health", icon: ActivitySquare, minRole: "admin" as const },
  { title: "Settings", url: "/admin/settings", icon: Settings, minRole: "admin" as const },
  { title: "Assignments", url: "/admin/product-assignments", icon: FlaskConical, minRole: "staff" as const },
];

const reportNavItems = [
  { title: "Sales Report", url: "/admin/reports/sales", icon: BarChart3 },
  { title: "Outstanding", url: "/admin/reports/outstanding", icon: Wallet },
  { title: "Aging", url: "/admin/reports/aging", icon: Hourglass },
  { title: "Inventory Report", url: "/admin/reports/inventory", icon: Boxes },
  { title: "GST Report", url: "/admin/reports/gst", icon: FileSpreadsheet },
  { title: "Customer Insights", url: "/admin/reports/customers", icon: Users },
];

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  staff: "Staff",
};

function AdminSidebar({ onSignOut, role }: { onSignOut: () => void; role: string | null }) {
  const { state } = useSidebar();
  const location = useLocation();
  const collapsed = state === "collapsed";
  const isReportsActive = location.pathname.startsWith("/admin/reports");

  const visibleItems = navItems.filter((item) => {
    if (item.minRole === "staff") return true;
    if (item.minRole === "admin") return role === "super_admin" || role === "admin";
    return false;
  });

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent>
        <div className="p-4 pb-6">
          {!collapsed ? (
            <img src={illumeLogo} alt="Illume" className="h-8 w-auto" />
          ) : (
            <img src={illumeLogo} alt="Illume" className="h-6 w-auto" />
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Reports</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isReportsActive}>
                  <NavLink
                    to="/admin/reports/sales"
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                    activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
                  >
                    <BarChart3 className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    {!collapsed && <span className="text-sm">Reports</span>}
                  </NavLink>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {reportNavItems.map((item) => (
                    <SidebarMenuSubItem key={item.url}>
                      <SidebarMenuSubButton asChild isActive={location.pathname === item.url}>
                        <NavLink
                          to={item.url}
                          className="text-sidebar-foreground/70 hover:text-sidebar-foreground"
                          activeClassName="text-sidebar-foreground"
                        >
                          <item.icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="/store"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent flex items-center transition-colors"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    {!collapsed && <span className="text-sm">Store</span>}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={onSignOut}
                    className="text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent flex items-center w-full transition-colors"
                  >
                    <LogOut className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    {!collapsed && <span className="text-sm">Sign Out</span>}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

const AdminLayout = () => {
  const { user, role, hasAccess, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-elevated">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user || !hasAccess) {
    return <Navigate to="/admin/login" replace />;
  }

  if (role === "branch_staff") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar onSignOut={signOut} role={role} />
        <div className="flex-1 flex flex-col bg-surface-elevated">
          <header className="h-14 flex items-center justify-between border-b border-border bg-background px-4">
            <SidebarTrigger />
            <div className="flex items-center gap-3">
              <AdminCommandPalette />
              <span className="text-[10px] tracking-[0.15em] text-muted-foreground uppercase border border-border px-2 py-1">
                {roleLabels[role || ""] || role}
              </span>
              <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
                {user.email}
              </span>
            </div>
          </header>
          <main className="flex-1 p-6 md:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
