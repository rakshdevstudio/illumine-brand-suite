import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BarChart3, Boxes, FileSpreadsheet, Hourglass, Users, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";

const reportLinks = [
  { title: "Sales Report", url: "/admin/reports/sales", icon: BarChart3 },
  { title: "Outstanding", url: "/admin/reports/outstanding", icon: Wallet },
  { title: "Aging", url: "/admin/reports/aging", icon: Hourglass },
  { title: "Inventory Report", url: "/admin/reports/inventory", icon: Boxes },
  { title: "GST Report", url: "/admin/reports/gst", icon: FileSpreadsheet },
  { title: "Customer Insights", url: "/admin/reports/customers", icon: Users },
];

const ReportsLayoutPage = () => {
  const location = useLocation();

  if (location.pathname === "/admin/reports") {
    return <Navigate to="/admin/reports/sales" replace />;
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <div className="flex min-w-max gap-2 rounded-full border border-border/70 bg-white/90 p-1 shadow-sm">
          {reportLinks.map((link) => (
            <NavLink
              key={link.url}
              to={link.url}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-colors",
                "hover:bg-stone-100 hover:text-foreground",
              )}
              activeClassName="bg-foreground text-background hover:bg-foreground hover:text-background"
            >
              <link.icon className="h-4 w-4" strokeWidth={1.6} />
              <span className="whitespace-nowrap">{link.title}</span>
            </NavLink>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
};

export default ReportsLayoutPage;
