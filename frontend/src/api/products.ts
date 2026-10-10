import type { Product, ProductList } from "../types/catalog";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface ProductListParams {
  q?: string;
  categoryId?: string;
  status: "all" | "active" | "inactive";
  stock: "all" | "low" | "out";
  page: number;
  pageSize: number;
}

export interface ProductPayload {
  name: string;
  sku: string;
  categoryId: string;
  description: string;
  imageUrl: string | null;
  sellingPrice: string;
  costPrice: string;
  gstPercent: string;
  prepTimeMin: number | null;
  minStock: number;
  isAvailable: boolean;
}

export interface CreateProductPayload extends ProductPayload {
  stockQuantity: number;
}

export async function listProducts(params: ProductListParams): Promise<ProductList> {
  const res = await api.get<Envelope<ProductList>>("/products", { params });
  return res.data.data;
}

export async function createProduct(payload: CreateProductPayload): Promise<Product> {
  const res = await api.post<Envelope<Product>>("/products", payload);
  return res.data.data;
}

export async function updateProduct(id: string, payload: ProductPayload): Promise<Product> {
  const res = await api.put<Envelope<Product>>(`/products/${id}`, payload);
  return res.data.data;
}

export async function setProductAvailability(id: string, isAvailable: boolean): Promise<Product> {
  const res = await api.patch<Envelope<Product>>(`/products/${id}/availability`, { isAvailable });
  return res.data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/products/${id}`);
}
