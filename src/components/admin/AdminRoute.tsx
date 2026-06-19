import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (role === "vendor") {
    return <Navigate to="/seller/dashboard" replace />;
  }

  if (role === "school_user") {
    return <Navigate to="/school/dashboard" replace />;
  }

  const isBackoffice = 
    role === "super_admin" || 
    role === "admin" || 
    role === "illume_team" || 
    role === "staff" || 
    role === "branch_staff";

  if (!isBackoffice) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
