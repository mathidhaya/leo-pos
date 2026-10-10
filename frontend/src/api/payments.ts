import type { PaymentList, PaymentMethod, PaymentResult } from "../types/payments";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface CreatePaymentRequest {
  orderId: string;
  method: PaymentMethod;
  amountReceived?: string;
  idempotencyKey: string;
}

export interface PaymentListParams {
  q?: string;
  from?: string;
  to?: string;
  method: "all" | PaymentMethod;
  page: number;
  pageSize: number;
}

export async function createPayment(body: CreatePaymentRequest): Promise<PaymentResult> {
  const res = await api.post<Envelope<PaymentResult>>("/payments", body);
  return res.data.data;
}

export async function listPayments(params: PaymentListParams): Promise<PaymentList> {
  const res = await api.get<Envelope<PaymentList>>("/payments", { params });
  return res.data.data;
}
