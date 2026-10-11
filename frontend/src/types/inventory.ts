export type StockStatus = "ok" | "low" | "out";

export interface InventoryItem {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  category: { id: string; name: string };
  isAvailable: boolean;
  quantity: number;
  minStock: number;
  status: StockStatus;
  updatedAt: string | null;
  added30: number;
  removed30: number;
}

export interface StockAlert {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  minStock: number;
  status: "low" | "out";
}

export interface InventoryList {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: { activeProducts: number; low: number; outOfStock: number };
  alerts: StockAlert[];
}

export type MovementType = "IN" | "OUT" | "ADJUST" | "SALE";

export interface Movement {
  id: string;
  createdAt: string;
  productId: string;
  productName: string;
  sku: string;
  type: MovementType;
  quantityChange: number;
  reason: string | null;
  by: string | null;
  orderNo: number | null;
}

export interface MovementList {
  items: Movement[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
