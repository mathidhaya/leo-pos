import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/routes/ProtectedRoute";
import PublicOnlyRoute from "./components/routes/PublicOnlyRoute";
import { NAV_ITEMS } from "./config/navigation";
import { AuthProvider } from "./context/AuthProvider";
import AppLayout from "./layouts/AppLayout";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import DashboardPage from "./pages/dashboard/DashboardPage";
import NotFoundPage from "./pages/NotFoundPage";

// Pages that are not built yet. Each one is limited to the roles that may see it.
// When a phase builds a real page, it replaces the matching entry here.
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
