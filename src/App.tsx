import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";

// Store
import StoreLayout from "./components/store/StoreLayout";
import StorePage from "./pages/store/StorePage";
import SchoolPage from "./pages/store/SchoolPage";
import ClassGenderPage from "./pages/store/ClassGenderPage";
import ClassProductsPage from "./pages/store/ClassProductsPage";
import ProductPage from "./pages/store/ProductPage";
import CartPage from "@/pages/store/CartPage";
import CheckoutPage from "./pages/store/CheckoutPage";
import ConfirmationPage from "./pages/store/ConfirmationPage";
import OrderDetailsPage from "./pages/store/OrderDetailsPage";
import TrackOrderPage from "./pages/store/TrackOrderPage";

// Admin
import AdminLayout from "./components/admin/AdminLayout";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import DashboardPage from "./pages/admin/DashboardPage";
import SchoolsPage from "./pages/admin/SchoolsPage";
import ClassesPage from "./pages/admin/ClassesPage";
import ProductsPage from "./pages/admin/ProductsPage";
import ProductVariantsPage from "./pages/admin/ProductVariantsPage";
import InventoryPage from "@/pages/admin/InventoryPage";
import InventoryAlertsPage from "./pages/admin/InventoryAlertsPage";
import OrdersPage from "./pages/admin/OrdersPage";
import InvoicePage from "@/pages/admin/InvoicePage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import ProductSegregationPage from "./pages/admin/ProductSegregationPage";
import SalesAnalyticsPage from "./pages/admin/SalesAnalyticsPage";
import ActivityLogsPage from "./pages/admin/ActivityLogsPage";
import BranchesPage from "./pages/admin/BranchesPage";

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
import BranchDashboardPage from "./pages/branch/BranchDashboardPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Navigate to="/store" replace />} />

          {/* Store Routes */}
          <Route path="/store" element={<StoreLayout />}>
            <Route index element={<StorePage />} />
            <Route path="school/:slug" element={<SchoolPage />} />
            <Route path="school/:slug/class/:classSlug" element={<ClassGenderPage />} />
            <Route path="school/:slug/class/:classSlug/gender/:gender" element={<ClassProductsPage />} />
            <Route path="product/:id" element={<ProductPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="confirmation" element={<ConfirmationPage />} />
            <Route path="order/:orderId" element={<OrderDetailsPage />} />
          </Route>

          <Route path="/track-order" element={<StoreLayout />}>
            <Route index element={<TrackOrderPage />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="sales" element={<SalesAnalyticsPage />} />
            <Route path="activity-logs" element={<ActivityLogsPage />} />
            <Route path="schools" element={<SchoolsPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="product-variants" element={<ProductVariantsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory-alerts" element={<InventoryAlertsPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderId" element={<OrdersPage />} />
            <Route path="orders/:orderId/invoice" element={<InvoicePage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="product-assignments" element={<ProductSegregationPage />} />
          </Route>

          <Route path="/branch/dashboard" element={<BranchDashboardPage />} />

          {/* Vendor Portal */}
          <Route path="/vendor/login" element={<VendorLoginPage />} />
          <Route path="/vendor/dashboard" element={<VendorDashboard />} />

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
