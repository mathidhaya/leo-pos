import type { OrderStatus, OrderType, PaymentMethod } from "../types/orders";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  PREPARING: "bg-blue-100 text-blue-800",
  READY: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-leo-100 text-leo-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export const TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: "Dine In",
  TAKE_AWAY: "Take Away",
  DELIVERY: "Delivery",
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

// The text on the button that moves an order into this status
export const ACTION_LABEL: Record<OrderStatus, string> = {
  PENDING: "Set to pending",
  PREPARING: "Start preparing",
  READY: "Mark ready",
  COMPLETED: "Mark completed",
  CANCELLED: "Cancel order",
};
