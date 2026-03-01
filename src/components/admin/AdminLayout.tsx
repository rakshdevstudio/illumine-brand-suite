import { Outlet } from "react-router-dom";
import { LayoutDashboard, Package, ShoppingCart, ExternalLink, GraduationCap, Box, Layers } from "lucide-react";
import illumeLogo from "@/assets/illume-logo.png";
import { NavLink } from "@/components/NavLink";
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
  { title: "Products", url: "/admin/products", icon: Box },
  { title: "Variants", url: "/admin/product-variants", icon: Layers },
  { title: "Inventory", url: "/admin/inventory", icon: Package },
  { title: "Orders", url: "/admin/orders", icon: ShoppingCart },
];

function AdminSidebar() {
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

const AdminLayout = () => (
  <SidebarProvider>
    <div className="min-h-screen flex w-full">
      <AdminSidebar />
      <div className="flex-1 flex flex-col">
        <header className="h-14 flex items-center border-b border-border px-4">
          <SidebarTrigger />
        </header>
        <main className="flex-1 p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  </SidebarProvider>
);

export default AdminLayout;
