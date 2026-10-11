import type { InventoryItem, InventoryList, MovementList, MovementType } from "../types/inventory";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface InventoryListParams {
  q?: string;
  categoryId?: string;
  stock: "all" | "low" | "out";
  page: number;
  pageSize: number;
}

export interface MovementListParams {
  q?: string;
  productId?: string;
  from?: string;
  to?: string;
  type: "all" | MovementType;
  page: number;
  pageSize: number;
}

export type AdjustRequest =
  | { action: "IN" | "OUT"; productId: string; quantity: number; reason?: string; idempotencyKey: string }
  | {
      action: "ADJUST";
      productId: string;
      newQuantity: number;
      expectedQuantity: number;
      reason: string;
      idempotencyKey: string;
    };

export async function listInventory(params: InventoryListParams): Promise<InventoryList> {
  const res = await api.get<Envelope<InventoryList>>("/inventory", { params });
  return res.data.data;
}

export async function listMovements(params: MovementListParams): Promise<MovementList> {
  const res = await api.get<Envelope<MovementList>>("/inventory/history", { params });
  return res.data.data;
}

export async function adjustStock(body: AdjustRequest): Promise<InventoryItem> {
  const res = await api.post<Envelope<InventoryItem>>("/inventory/adjust", body);
  return res.data.data;
}
