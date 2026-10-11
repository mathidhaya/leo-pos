export type GroupBy = "day" | "week" | "month" | "year";
export type ReportKind = "sales" | "profit" | "products" | "categories" | "payments";
export type ReportFormat = "csv" | "pdf";
export type MethodName = "CASH" | "UPI" | "CARD" | "OTHER";

// What every tab needs to know to load its report
export interface TabProps {
  from: string;
  to: string;
  groupBy: GroupBy;
}

export interface TrendRange {
  from: string;
  to: string;
  groupBy: GroupBy;
}

export interface SalesPoint {
  bucket: string;
  label: string;
  short: string;
  orders: number;
  revenue: string;
  discount: string;
  tax: string;
  delivery: string;
  total: string;
  profit: string;
}

export interface SalesReport {
  range: TrendRange;
  summary: {
    orders: number;
    total: string;
    averageOrder: string;
    revenue: string;
    discount: string;
    tax: string;
    delivery: string;
    profit: string;
    unpaidOrders: number;
    cancelledOrders: number;
  };
  series: SalesPoint[];
}

export interface ProfitPoint {
  bucket: string;
  label: string;
  short: string;
  revenue: string;
  discount: string;
  cost: string;
  profit: string;
  marginPercent: number | null;
}

export interface ProfitReport {
  range: TrendRange;
  summary: {
    revenue: string;
    discount: string;
    netSales: string;
    tax: string;
    cost: string;
    profit: string;
    marginPercent: number | null;
  };
  series: ProfitPoint[];
}

export interface ItemTotals {
  quantity: number;
  revenue: string;
  discount: string;
  cost: string;
  profit: string;
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  revenue: string;
  discount: string;
  cost: string;
  profit: string;
  marginPercent: number | null;
}

export interface ProductsReport {
  range: { from: string; to: string };
  truncated: boolean;
  rows: ProductRow[];
  totals: ItemTotals;
}

export interface CategoryRow {
  id: string;
  name: string;
  quantity: number;
  revenue: string;
  discount: string;
  cost: string;
  profit: string;
  sharePercent: number | null;
}

export interface CategoriesReport {
  range: { from: string; to: string };
  rows: CategoryRow[];
  totals: ItemTotals;
}

export interface PaymentRow {
  method: MethodName;
  payments: number;
  total: string;
  sharePercent: number | null;
}

export interface PaymentsReport {
  range: { from: string; to: string };
  rows: PaymentRow[];
  summary: {
    collected: string;
    payments: number;
    refunds: { count: number; total: string };
  };
}
