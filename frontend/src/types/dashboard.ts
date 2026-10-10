export type RangeKey = "today" | "week" | "month" | "custom";
export type OrderStatus = "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";
export type PaymentMethod = "CASH" | "UPI" | "CARD" | "OTHER";
export type OrderType = "DINE_IN" | "TAKE_AWAY" | "DELIVERY";

export interface Summary {
  sales: string;
  orders: number;
  pending: number;
  completed: number;
  cancelled: number;
  profit: string | null;
}

export interface SeriesPoint {
  bucket: string;
  label: string;
  sales: string;
  orders: number;
  profit: string | null;
}

export interface TopProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  revenue: string;
}

export interface RecentOrder {
  id: string;
  orderNo: number;
  createdAt: string;
  customerName: string | null;
  orderType: OrderType;
  amount: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod | null;
}

export interface DashboardData {
  range: { key: RangeKey; from: string; to: string; granularity: "hour" | "day" };
  canViewProfit: boolean;
  today: Summary;
  rangeSummary: Summary;
  series: SeriesPoint[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
}
