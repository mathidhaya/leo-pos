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

// An unpaid order can always be cancelled. A paid one can only be cancelled (and refunded)
// by someone allowed to refund: the owner or a manager.
export function allowedNextStatuses(
  status: OrderStatusName,
  paymentStatus: PaymentStatusName,
  canRefund = false
): OrderStatusName[] {
  return FORWARD[status].filter(
    (next) => next !== "CANCELLED" || paymentStatus === "UNPAID" || (paymentStatus === "PAID" && canRefund)
  );
}

export function canChangeStatus(
  from: OrderStatusName,
  to: OrderStatusName,
  paymentStatus: PaymentStatusName,
  canRefund = false
): boolean {
  return allowedNextStatuses(from, paymentStatus, canRefund).includes(to);
}
