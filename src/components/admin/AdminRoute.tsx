import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { session, isChecking } = useRequireAuth();

  if (isChecking) {
    return (
      <div className="min-h-[220px] flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!session?.user) {
    return <Navigate to="/" replace />;
  }

  const metadataRole = String(session.user.user_metadata?.role ?? "").toLowerCase();
  if (metadataRole !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
