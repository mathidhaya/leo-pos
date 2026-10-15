import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Coffee, LogOut, Menu, WifiOff, X } from "lucide-react";
import { NAV_ITEMS } from "../config/navigation";
import { useAppSettings } from "../hooks/useAppSettings";
import { useAuth } from "../hooks/useAuth";
import { useOnline } from "../hooks/useOnline";
import { ROLE_LABEL } from "../utils/roles";

// The cafe's logo, or the coffee cup when there is none
function Logo({ url, className }: { url: string | null | undefined; className: string }) {
  return url ? (
    <img src={url} alt="" className={`${className} object-cover`} />
  ) : (
    <span className={`${className} flex items-center justify-center bg-leo-600 text-white`}>
      <Coffee className="h-5 w-5" />
    </span>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { data: app } = useAppSettings();
  const location = useLocation();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const firstRoute = useRef(true);

  // The live values win, so a new cafe name or your own new name shows without logging in again
  const cafeName = app?.shopName ?? user?.shop.name ?? "Leo Cafe";
  const personName = app?.userName || user?.name || "";
  const current = NAV_ITEMS.find(
    (item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`)
  );

  // The browser tab names the page, for example "Orders · Leo Cafe"
  useEffect(() => {
    document.title = current ? `${current.label} · ${cafeName}` : cafeName;
  }, [current, cafeName]);

  // On a phone: opening the menu moves the focus into it, closing it gives the focus back
  useEffect(() => {
    if (menuOpen) navRef.current?.querySelector<HTMLElement>("a")?.focus();
    else if (wasOpen.current) menuButtonRef.current?.focus();
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  // When you go to another page, the focus moves to the page, so keyboard and screen reader users start at the top of it.
  // (Not on the first load, and not if a field on the new page already took the focus, like the order screen's search box.)
  useEffect(() => {
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    const main = mainRef.current;
    if (main && !main.contains(document.activeElement)) main.focus({ preventScroll: true });
  }, [location.pathname]);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  return (
    <div className="min-h-screen bg-leo-50 lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-leo-700 focus:shadow-lg"
      >
        Skip to main content
      </a>

      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="sidebar"
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-200 bg-white transition-[transform,visibility] duration-200",
          "lg:visible lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          // While the menu is closed on a phone it is also invisible, so the keyboard cannot reach it
          menuOpen ? "visible translate-x-0" : "invisible -translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-2">
            <Logo url={app?.logoUrl} className="h-9 w-9 shrink-0 rounded-lg" />
            <span className="truncate text-lg font-bold text-leo-700">{cafeName}</span>
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav ref={navRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-2" aria-label="Main">
          {items.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                [
                  "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  isActive ? "bg-leo-600 text-white" : "text-gray-700 hover:bg-leo-50 hover:text-leo-700",
                ].join(" ")
              }
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-200 p-4">
          <p className="truncate text-sm font-semibold text-gray-900">{personName}</p>
          <p className="truncate text-xs text-gray-500">
            {ROLE_LABEL[user.role]} &middot; {cafeName}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen(true)}
            className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="truncate font-bold text-leo-700">{cafeName}</span>
        </header>

        {!online && (
          <div
            role="status"
            className="sticky top-14 z-20 flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 lg:top-0"
          >
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            You are offline. Orders and payments cannot be saved until the connection is back.
          </div>
        )}

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl px-4 py-6 focus:outline-none sm:px-6 lg:py-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
