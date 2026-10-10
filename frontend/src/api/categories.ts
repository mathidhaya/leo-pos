import type { Category } from "../types/catalog";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface CategoryPayload {
  name: string;
  imageUrl: string | null;
  isActive: boolean;
}

export async function listCategories(): Promise<Category[]> {
  const res = await api.get<Envelope<Category[]>>("/categories");
  return res.data.data;
}

export async function createCategory(payload: CategoryPayload): Promise<Category> {
  const res = await api.post<Envelope<Category>>("/categories", payload);
  return res.data.data;
}

export async function updateCategory(id: string, payload: CategoryPayload): Promise<Category> {
  const res = await api.put<Envelope<Category>>(`/categories/${id}`, payload);
  return res.data.data;
}

export async function deleteCategory(id: string, reassignTo?: string): Promise<void> {
  await api.delete(`/categories/${id}`, { params: reassignTo ? { reassignTo } : undefined });
}
