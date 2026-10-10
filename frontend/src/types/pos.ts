export type OrderType = "DINE_IN" | "TAKE_AWAY" | "DELIVERY";

export interface PosCategory {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  categoryId: string;
  sellingPrice: string;
  gstPercent: string;
  prepTimeMin: number | null;
  stock: { quantity: number; minStock: number; status: "ok" | "low" | "out" };
}

export interface PosCatalog {
  categories: PosCategory[];
  products: PosProduct[];
}

export interface QuoteLine {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: string;
  gstPercent: string;
  discount: string;
  taxable: string;
  tax: string;
  total: string;
}

// The server's own calculation of the bill
export interface Quote {
  orderType: OrderType;
  lines: QuoteLine[];
  subtotal: string;
  discount: string;
  tax: string;
  deliveryCharge: string;
  grandTotal: string;
}
