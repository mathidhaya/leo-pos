export interface Category {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  productCount: number;
}

export type StockStatus = "ok" | "low" | "out";

export interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  imageUrl: string | null;
  sellingPrice: string;
  costPrice: string | null;
  profit: string | null;
  gstPercent: string;
  prepTimeMin: number | null;
  isAvailable: boolean;
  category: { id: string; name: string };
  stock: { quantity: number; minStock: number; status: StockStatus };
  createdAt: string;
}

export interface ProductList {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
