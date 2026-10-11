// The biggest stock number the system accepts for one product.
export const MAX_STOCK = 1_000_000;

export type StockStatus = "ok" | "low" | "out";

// Out = nothing left. Low = some left, but at or below the minimum. The same rule everywhere.
export function stockStatus(quantity: number, minStock: number): StockStatus {
  if (quantity === 0) return "out";
  return quantity <= minStock ? "low" : "ok";
}
