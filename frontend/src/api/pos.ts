import type { OrderType, PosCatalog, Quote } from "../types/pos";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface QuoteRequest {
  items: Array<{ productId: string; quantity: number }>;
  discount: { type: "none" } | { type: "percent" | "amount"; value: string };
  orderType: OrderType;
  deliveryCharge?: string;
}

export async function fetchCatalog(): Promise<PosCatalog> {
  const res = await api.get<Envelope<PosCatalog>>("/pos/catalog");
  return res.data.data;
}

export async function requestQuote(body: QuoteRequest): Promise<Quote> {
  const res = await api.post<Envelope<Quote>>("/pos/quote", body);
  return res.data.data;
}
