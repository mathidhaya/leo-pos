export type OrderStatusName = "PENDING" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type PaymentStatusName = "UNPAID" | "PAID" | "REFUNDED";

// Orders only move forward. Steps may be skipped (for example a counter sale can go straight to Completed).
const FORWARD: Record<OrderStatusName, OrderStatusName[]> = {
  PENDING: ["PREPARING", "READY", "COMPLETED", "CANCELLED"],
  PREPARING: ["READY", "COMPLETED", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

// A paid order cannot be cancelled here: it would need a refund (added with payments in Step 8).
export function allowedNextStatuses(status: OrderStatusName, paymentStatus: PaymentStatusName): OrderStatusName[] {
  return FORWARD[status].filter((next) => next !== "CANCELLED" || paymentStatus === "UNPAID");
}

export function canChangeStatus(
  from: OrderStatusName,
  to: OrderStatusName,
  paymentStatus: PaymentStatusName
): boolean {
  return allowedNextStatuses(from, paymentStatus).includes(to);
}
