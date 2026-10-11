import type { OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "./orders";

export type CustomerSort = "name" | "recent" | "orders" | "spent" | "newest";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  createdAt: string;
  orders: number; // orders that were not cancelled
  spent: string; // paid orders that were not cancelled
  lastOrderAt: string | null;
}

export interface CustomerList {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomerOrder {
  id: string;
  orderNo: number;
  createdAt: string;
  orderType: OrderType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amount: string;
  paymentMethod: PaymentMethod | null;
}

export interface CustomerOrderList {
  items: CustomerOrder[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
