import { Outlet, Navigate } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, ExternalLink, GraduationCap, Box, Layers, BookOpen, LogOut } from "lucide-react";
import illumeLogo from "@/assets/illume-logo.png";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/hooks/use-auth";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Schools", url: "/admin/schools", icon: GraduationCap },
  { title: "Classes", url: "/admin/classes", icon: BookOpen },
  { title: "Products", url: "/admin/products", icon: Box },
  { title: "Variants", url: "/admin/product-variants", icon: Layers },
  { title: "Inventory", url: "/admin/inventory", icon: Package },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart },
];

function AdminSidebar({ onSignOut }: { onSignOut: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        <div className="p-4">
          {!collapsed ? (
            <img src={illumeLogo} alt="Illume" className="h-10 w-auto" style={{ filter: "brightness(0)" }} />
          ) : (
            <img src={illumeLogo} alt="Illume" className="h-8 w-auto" style={{ filter: "brightness(0)" }} />
          )}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className="hover:bg-accent"
                      activeClassName="bg-accent font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4" strokeWidth={1.5} />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="/store"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:bg-accent flex items-center"
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
                    className="hover:bg-accent flex items-center w-full text-muted-foreground hover:text-foreground"
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
  const { user, isAdmin, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/admin/login" replace />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar onSignOut={signOut} />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b border-border px-4">
            <SidebarTrigger />
            <span className="text-[10px] tracking-[0.2em] text-muted-foreground uppercase">
              {user.email}
            </span>
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
