import type { OrderDetail, OrderList, OrderStatus, OrderType } from "../types/orders";
import { api } from "./client";
import type { QuoteRequest } from "./pos";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface CreateOrderRequest extends QuoteRequest {
  idempotencyKey: string;
  expectedTotal: string;
  tableNo?: string;
  guests?: number | null;
  customerName?: string;
  customerPhone?: string;
  address?: string;
}

export interface OrderListParams {
  q?: string;
  from?: string;
  to?: string;
  status: OrderStatus | "all";
  orderType: OrderType | "all";
  payment: "all" | "UNPAID" | "CASH" | "UPI" | "CARD" | "OTHER";
  page: number;
  pageSize: number;
}

export async function createOrder(body: CreateOrderRequest): Promise<OrderDetail> {
  const res = await api.post<Envelope<OrderDetail>>("/orders", body);
  return res.data.data;
}

export async function listOrders(params: OrderListParams): Promise<OrderList> {
  const res = await api.get<Envelope<OrderList>>("/orders", { params });
  return res.data.data;
}

export async function getOrder(id: string): Promise<OrderDetail> {
  const res = await api.get<Envelope<OrderDetail>>(`/orders/${id}`);
  return res.data.data;
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<OrderDetail> {
  const res = await api.patch<Envelope<OrderDetail>>(`/orders/${id}/status`, { status });
  return res.data.data;
}
