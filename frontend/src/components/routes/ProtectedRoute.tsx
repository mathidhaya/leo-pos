import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types/auth";
import FullPageSpinner from "../ui/FullPageSpinner";

// Wrap pages that need a login. Optionally limit them to certain roles:
//   <Route element={<ProtectedRoute roles={["OWNER", "MANAGER"]} />}> ... </Route>
export default function ProtectedRoute({ roles }: { roles?: Role[] }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
