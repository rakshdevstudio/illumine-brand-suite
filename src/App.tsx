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
import ProductPage from "./pages/store/ProductPage";
import CartPage from "./pages/store/CartPage";
import CheckoutPage from "./pages/store/CheckoutPage";
import ConfirmationPage from "./pages/store/ConfirmationPage";

// Admin
import AdminLayout from "./components/admin/AdminLayout";
import AdminLoginPage from "./pages/admin/AdminLoginPage";
import DashboardPage from "./pages/admin/DashboardPage";
import SchoolsPage from "./pages/admin/SchoolsPage";
import ClassesPage from "./pages/admin/ClassesPage";
import ProductsPage from "./pages/admin/ProductsPage";
import ProductVariantsPage from "./pages/admin/ProductVariantsPage";
import InventoryPage from "./pages/admin/InventoryPage";
import OrdersPage from "./pages/admin/OrdersPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/store" replace />} />

          {/* Store Routes */}
          <Route path="/store" element={<StoreLayout />}>
            <Route index element={<StorePage />} />
            <Route path="school/:slug" element={<SchoolPage />} />
            <Route path="product/:id" element={<ProductPage />} />
            <Route path="cart" element={<CartPage />} />
            <Route path="checkout" element={<CheckoutPage />} />
            <Route path="confirmation" element={<ConfirmationPage />} />
          </Route>

          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="schools" element={<SchoolsPage />} />
            <Route path="classes" element={<ClassesPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="product-variants" element={<ProductVariantsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="orders" element={<OrdersPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
