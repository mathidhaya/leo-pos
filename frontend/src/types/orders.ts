import type { OrderStatus, PaymentMethod, PaymentStatus } from "./dashboard";
import type { OrderType } from "./pos";

export type { OrderStatus, OrderType, PaymentMethod, PaymentStatus };

export interface OrderListItem {
  id: string;
  orderNo: number;
  createdAt: string;
  orderType: OrderType;
  tableNo: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amount: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentMethod: PaymentMethod | null;
}

export interface OrderList {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface OrderLine {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: string;
  gstPercent: string;
  discount: string;
  tax: string;
  total: string;
}

export interface OrderDetail {
  id: string;
  orderNo: number;
  createdAt: string;
  orderType: OrderType;
  tableNo: string | null;
  guests: number | null;
  deliveryAddress: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string | null;
  customerPhone: string | null;
  cashier: string;
  items: OrderLine[];
  subtotal: string;
  discount: string;
  tax: string;
  deliveryCharge: string;
  grandTotal: string;
  payments: Array<{ method: PaymentMethod; amount: string; refundedAt: string | null }>;
  invoiceId: string | null;
  invoiceNo: string | null;
  // The server decides what this person may do
  canPay: boolean;
  actions: OrderStatus[];
}
