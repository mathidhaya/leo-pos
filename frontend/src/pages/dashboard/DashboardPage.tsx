import { useState } from "react";
import { Coffee, LogOut } from "lucide-react";
import Button from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import type { Role } from "../../types/auth";
import { getGreeting } from "../../utils/greeting";

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

// Temporary page. The real dashboard (sales, orders, charts) is built in Phase 4.
export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  if (!user) return null;

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <div className="min-h-screen bg-leo-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-leo-600 text-white">
              <Coffee className="h-5 w-5" />
            </span>
            <span className="font-bold text-leo-700">Leo Cafe</span>
          </div>
          <Button variant="secondary" className="h-10 px-4 text-sm" onClick={handleLogout} loading={loggingOut}>
            {!loggingOut && <LogOut className="h-4 w-4" />}
            Logout
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          {getGreeting()}, {ROLE_LABEL[user.role]} 👋
        </h1>
        <p className="mt-1 text-gray-600">Welcome to {user.shop.name}.</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Signed in as</p>
            <p className="mt-1 truncate font-semibold text-gray-900">{user.name}</p>
            <p className="truncate text-sm text-gray-500">{user.email ?? user.phone}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Role</p>
            <p className="mt-1 font-semibold text-gray-900">{ROLE_LABEL[user.role]}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Cafe</p>
            <p className="mt-1 truncate font-semibold text-gray-900">{user.shop.name}</p>
          </div>
        </div>

        <p className="mt-8 rounded-xl border border-dashed border-leo-500/40 bg-white/60 p-4 text-sm text-gray-600">
          Sales, orders and charts will appear here in Phase 4.
        </p>
      </main>
    </div>
  );
}
