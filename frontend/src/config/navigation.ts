import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Tags,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "../types/auth";

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  roles: Role[];
  // The phase that builds this page. Pages without one are finished.
  phase?: number;
}

const ALL: Role[] = ["OWNER", "MANAGER", "CASHIER"];

// Who sees what follows the role list in the project spec.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, roles: ALL },
  { label: "New Order", path: "/pos", icon: ShoppingCart, roles: ["OWNER", "CASHIER"] },
  { label: "Orders", path: "/orders", icon: ClipboardList, roles: ALL },
  { label: "Products", path: "/products", icon: Package, roles: ["OWNER", "MANAGER"] },
  { label: "Categories", path: "/categories", icon: Tags, roles: ["OWNER", "MANAGER"] },
  { label: "Inventory", path: "/inventory", icon: Boxes, roles: ["OWNER", "MANAGER"] },
  { label: "Customers", path: "/customers", icon: Users, roles: ALL },
  { label: "Payments", path: "/payments", icon: Wallet, roles: ["OWNER", "CASHIER"] },
  { label: "Invoices", path: "/invoices", icon: Receipt, roles: ["OWNER", "CASHIER"] },
  { label: "Reports", path: "/reports", icon: TrendingUp, roles: ["OWNER", "MANAGER"] },
  { label: "Staff", path: "/staff", icon: UserCog, roles: ["OWNER"] },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["OWNER"], phase: 13 },
];
