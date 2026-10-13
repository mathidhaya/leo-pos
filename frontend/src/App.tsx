import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/routes/ProtectedRoute";
import PublicOnlyRoute from "./components/routes/PublicOnlyRoute";
import { NAV_ITEMS } from "./config/navigation";
import { AuthProvider } from "./context/AuthProvider";
import AppLayout from "./layouts/AppLayout";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import CategoriesPage from "./pages/categories/CategoriesPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import CustomersPage from "./pages/customers/CustomersPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import InventoryPage from "./pages/inventory/InventoryPage";
import InvoicesPage from "./pages/invoices/InvoicesPage";
import NotFoundPage from "./pages/NotFoundPage";
import OrdersPage from "./pages/orders/OrdersPage";
import PaymentsPage from "./pages/payments/PaymentsPage";
import PosPage from "./pages/pos/PosPage";
import ProductsPage from "./pages/products/ProductsPage";
import ReportsPage from "./pages/reports/ReportsPage";
import SettingsPage from "./pages/settings/SettingsPage";
import StaffPage from "./pages/staff/StaffPage";

// Pages that are not built yet. When a phase builds a real page, its navigation entry
// loses its "phase" number and the page gets its own route below.
const placeholderItems = NAV_ITEMS.filter((item) => item.phase !== undefined);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              {/* Every role can open Settings. Cafe, billing and receipt are shown to the owner only. */}
              <Route path="/settings" element={<SettingsPage />} />

              <Route element={<ProtectedRoute roles={["OWNER", "CASHIER"]} />}>
                <Route path="/pos" element={<PosPage />} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route path="/invoices" element={<InvoicesPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={["OWNER", "MANAGER"]} />}>
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/reports" element={<ReportsPage />} />
              </Route>

              <Route element={<ProtectedRoute roles={["OWNER"]} />}>
                <Route path="/staff" element={<StaffPage />} />
              </Route>

              {placeholderItems.map((item) => (
                <Route key={item.path} element={<ProtectedRoute roles={item.roles} />}>
                  <Route path={item.path} element={<ComingSoonPage title={item.label} phase={item.phase} />} />
                </Route>
              ))}
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
