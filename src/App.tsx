import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import NotFound from "./pages/NotFound";
import { supabase } from "@/integrations/supabase/client";
import { isAuthError, redirectToLogin } from "@/lib/safeQuery";

// Store
import StoreLayout from "./components/store/StoreLayout";
import StorePage from "./pages/store/StorePage";
import AboutPage from "./pages/store/AboutPage";
import SchoolPage from "./pages/store/SchoolPage";
import ClassGenderPage from "./pages/store/ClassGenderPage";
import ClassProductsPage from "./pages/store/ClassProductsPage";
import ProductPage from "./pages/store/ProductPage";
import CartPage from "@/pages/store/CartPage";
import CheckoutPage from "./pages/store/CheckoutPage";
import ConfirmationPage from "./pages/store/ConfirmationPage";
import OrderDetailsPage from "./pages/store/OrderDetailsPage";
import StoreInvoicePage from "./pages/store/InvoicePage";
import TrackOrderPage from "./pages/store/TrackOrderPage";
import SchoolCodePage from "./pages/store/SchoolCodePage";
import RequireSchoolContext from "./components/store/RequireSchoolContext";
import ShopBySchoolPage from "./pages/store/ShopBySchoolPage";
import ContactPage from "./pages/store/ContactPage";
import ScrollToTop from "./components/store/ScrollToTop";
import GoToTopButton from "./components/store/GoToTopButton";

// Admin
import AdminLayout from "./components/admin/AdminLayout";
import AdminRoute from "./components/admin/AdminRoute";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import DashboardPage from "./pages/admin/DashboardPage";
import SchoolsPage from "./pages/admin/SchoolsPage";
import ClassesPage from "./pages/admin/ClassesPage";
import ProductsPage from "./pages/admin/ProductsPage";
import ProductVariantsPage from "./pages/admin/ProductVariantsPage";
import InventoryPage from "@/pages/admin/InventoryPage";
import InventoryAlertsPage from "./pages/admin/InventoryAlertsPage";
import OrdersPage from "./pages/admin/OrdersPage";
import InvoicePage from "./pages/admin/InvoicePage";
import InvoicesPage from "./pages/admin/InvoicesPage";
import CustomersPage from "./pages/admin/CustomersPage";
import CustomerDetailPage from "./pages/admin/CustomerDetailPage";
import StudentsPage from "./pages/admin/StudentsPage";
import VendorsPage from "./pages/admin/VendorsPage";
import SuppliersPage from "./pages/admin/SuppliersPage";
import PurchasesPage from "./pages/admin/PurchasesPage";
import LedgerPage from "./pages/admin/LedgerPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import ProductSegregationPage from "./pages/admin/ProductSegregationPage";
import ActivityLogsPage from "./pages/admin/ActivityLogsPage";
import ContactEnquiriesPage from "./pages/admin/ContactEnquiriesPage";
import ReportsLayoutPage from "./pages/admin/reports/ReportsLayoutPage";
import SalesReportPage from "./pages/admin/reports/SalesReportPage";
import InventoryReportPage from "./pages/admin/reports/InventoryReportPage";
import GstReportPage from "./pages/admin/reports/GstReportPage";
import CustomerInsightsPage from "./pages/admin/reports/CustomerInsightsPage";
import OutstandingReportPage from "./pages/admin/reports/OutstandingReportPage";
import AgingReportPage from "./pages/admin/reports/AgingReportPage";

// Vendor Portal
import VendorLoginPage from "./pages/vendor/VendorLoginPage";
import VendorDashboard from "./pages/vendor/VendorDashboard";

// School Portal
import SchoolLoginPage from "./pages/school/SchoolLoginPage";
import SchoolDashboard from "./pages/school/SchoolDashboard";
import SchoolOrdersPage from "./pages/school/SchoolOrdersPage";

// POS
import PosLoginPage from "./pages/pos/PosLoginPage";
import PosDashboard from "./pages/pos/PosDashboard";
import { useSchoolContext } from "./lib/school-context";

const signOutLocallyAndRedirect = async () => {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } finally {
    redirectToLogin();
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isAuthError(error)) {
        void signOutLocallyAndRedirect();
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isAuthError(error)) {
        void signOutLocallyAndRedirect();
      }
    },
  }),
});

const isProtectedPath = (path: string) =>
  path.startsWith("/admin") ||
  path.startsWith("/vendor") ||
  path.startsWith("/seller") ||
  path.startsWith("/school") ||
  path.startsWith("/pos") ||
  path.startsWith("/branch");

const sessionsEqual = (a: Session | null, b: Session | null) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.access_token === b.access_token && a.refresh_token === b.refresh_token;
};

const AppSessionLifecycle = () => {
  const appQueryClient = useQueryClient();
  const [isHydrated, setIsHydrated] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const hydrateSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        const next = data?.session ?? null;
        setSession((prev) => (sessionsEqual(prev, next) ? prev : next));
      } finally {
        if (mounted) {
          hydratedRef.current = true;
          setIsHydrated(true);
        }
      }
    };

    void hydrateSession();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((event, session) => {
      setSession((prev) => (sessionsEqual(prev, session ?? null) ? prev : session ?? null));

      if (event === "TOKEN_REFRESHED") {
        void appQueryClient.invalidateQueries();
      }

      if (event === "SIGNED_OUT" && hydratedRef.current && isProtectedPath(window.location.pathname)) {
        redirectToLogin();
        return;
      }
    });

    const onFocus = async () => {
      if (!hydratedRef.current) return;
      if (!isProtectedPath(window.location.pathname)) return;
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        redirectToLogin();
      }
    };

    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
      window.removeEventListener("focus", onFocus);
    };
  }, [appQueryClient]);

  useEffect(() => {
    if (!isHydrated) return;
    if (!session && isProtectedPath(window.location.pathname)) {
      redirectToLogin();
    }
  }, [isHydrated, session]);

  if (!isHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-elevated">
        <p className="text-xs tracking-[0.2em] text-muted-foreground uppercase animate-pulse">Loading...</p>
      </div>
    );
  }

  return null;
};

const StoreIndexRedirect = () => {
  const school = useSchoolContext((s) => s.school);
  if (!school) return <Navigate to="/shop-by-school" replace />;
  return <Navigate to={`/store/school/${school.slug}`} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppSessionLifecycle />
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ScrollToTop />
        <GoToTopButton />
        <Routes>
          {/* Public homepage (marketing) */}
          <Route path="/" element={<StoreLayout />}>
            <Route index element={<StorePage />} />
          </Route>

          <Route path="/contact" element={<StoreLayout />}>
            <Route index element={<ContactPage />} />
          </Route>

          <Route path="/about" element={<StoreLayout />}>
            <Route index element={<AboutPage />} />
          </Route>

          {/* Public entry landing */}
          <Route path="/shop-by-school" element={<StoreLayout />}>
            <Route index element={<ShopBySchoolPage />} />
          </Route>

          {/* Code entry page */}
          <Route path="/store/enter-school" element={<SchoolCodePage />} />

          {/* Store Routes (protected) */}
          <Route path="/store" element={<RequireSchoolContext><StoreLayout /></RequireSchoolContext>}>
            <Route index element={<StoreIndexRedirect />} />
            <Route path="school/:slug" element={<SchoolPage />} />
            <Route path="school/:slug/class/:classSlug" element={<ClassGenderPage />} />
            <Route path="school/:slug/class/:classSlug/gender/:gender" element={<ClassProductsPage />} />
            <Route path="product/:id" element={<ProductPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="confirmation" element={<ConfirmationPage />} />
            <Route path="order/:orderId" element={<OrderDetailsPage />} />
            <Route path="invoice/:invoiceId" element={<StoreInvoicePage />} />
          </Route>

          <Route path="/track-order" element={<RequireSchoolContext><StoreLayout /></RequireSchoolContext>}>
            <Route index element={<TrackOrderPage />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="sales" element={<Navigate to="/admin/reports/sales" replace />} />
            <Route path="activity-logs" element={<ActivityLogsPage />} />
            <Route path="schools" element={<SchoolsPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="product-variants" element={<ProductVariantsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory-alerts" element={<InventoryAlertsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrdersPage />} />
            <Route path="invoices" element={<InvoicesPage />} />
            <Route path="invoices/:id" element={<InvoicePage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="customers/:id" element={<CustomerDetailPage />} />
            <Route path="students" element={<StudentsPage />} />
            <Route path="suppliers" element={<SuppliersPage />} />
            <Route path="sellers" element={<VendorsPage />} />
            <Route path="vendors" element={<Navigate to="/admin/sellers" replace />} />
            <Route path="purchases" element={<PurchasesPage />} />
            <Route path="ledger" element={<LedgerPage />} />
            <Route path="contact-enquiries" element={<ContactEnquiriesPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="product-assignments" element={<ProductSegregationPage />} />
            <Route path="reports" element={<ReportsLayoutPage />}>
              <Route index element={<Navigate to="/admin/reports/sales" replace />} />
              <Route path="sales" element={<SalesReportPage />} />
              <Route path="outstanding" element={<OutstandingReportPage />} />
              <Route path="aging" element={<AgingReportPage />} />
              <Route path="inventory" element={<InventoryReportPage />} />
              <Route path="gst" element={<GstReportPage />} />
              <Route path="customers" element={<CustomerInsightsPage />} />
            </Route>
          </Route>

          {/* Vendor Portal */}
          <Route path="/vendor/login" element={<VendorLoginPage />} />
          <Route path="/vendor" element={<Navigate to="/vendor/dashboard" replace />} />
          <Route path="/vendor/dashboard" element={<VendorDashboard />} />
          <Route path="/seller/login" element={<VendorLoginPage />} />
          <Route path="/seller" element={<Navigate to="/seller/dashboard" replace />} />
          <Route path="/seller/dashboard" element={<VendorDashboard />} />

          {/* School Portal */}
          <Route path="/school/login" element={<SchoolLoginPage />} />
          <Route path="/school/dashboard" element={<SchoolDashboard />} />
          <Route path="/school/orders" element={<SchoolOrdersPage />} />

          {/* POS */}
          <Route path="/pos/login" element={<PosLoginPage />} />
          <Route path="/pos" element={<PosDashboard />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
