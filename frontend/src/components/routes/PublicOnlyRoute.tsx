import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import FullPageSpinner from "../ui/FullPageSpinner";

// Login and Register pages: logged-in users are sent to the dashboard instead.
export default function PublicOnlyRoute() {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullPageSpinner />;

  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? "/dashboard"} replace />;
  }

  return <Outlet />;
}
