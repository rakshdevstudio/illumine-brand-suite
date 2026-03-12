import { useAuth } from "@/hooks/use-auth";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import illumeLogo from "@/assets/illume-logo.png";

const SchoolDashboard = () => {
  const { user, isSchoolUser, hasAccess, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  if (!user || !hasAccess || !isSchoolUser) {
    return <Navigate to="/school/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background px-8 py-12">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <img src={illumeLogo} alt="Illume" className="h-8 w-auto" style={{ filter: "brightness(0)" }} />
          <Button variant="outline" onClick={signOut} className="text-xs tracking-[0.2em] uppercase h-9 px-4">
            Sign Out
          </Button>
        </div>
        <h1 className="text-2xl font-extralight tracking-[0.1em] uppercase mb-2">School Dashboard</h1>
        <p className="text-sm text-muted-foreground mb-12">{user.email}</p>
        <div className="border border-border p-8 text-center">
          <p className="text-sm text-muted-foreground tracking-wider">
            School portal features are coming soon.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SchoolDashboard;
