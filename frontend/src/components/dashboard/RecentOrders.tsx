import type { OrderStatus, OrderType, PaymentMethod, RecentOrder } from "../../types/dashboard";
import { formatDateTime, formatMoney, formatOrderNo } from "../../utils/format";

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  PREPARING: "bg-blue-100 text-blue-800",
  READY: "bg-indigo-100 text-indigo-800",
  COMPLETED: "bg-leo-100 text-leo-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: "Dine In",
  TAKE_AWAY: "Take Away",
  DELIVERY: "Delivery",
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

export default function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  if (orders.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No orders yet.</p>;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-4 font-medium">Order</th>
            <th className="py-2 pr-4 font-medium">Customer</th>
            <th className="py-2 pr-4 font-medium">Date / time</th>
            <th className="py-2 pr-4 text-right font-medium">Amount</th>
            <th className="py-2 pr-4 font-medium">Payment</th>
            <th className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.id} className="border-b border-gray-100 last:border-0">
              <td className="py-3 pr-4 font-semibold text-gray-900">{formatOrderNo(order.orderNo)}</td>
              <td className="py-3 pr-4">
                <p className="text-gray-900">{order.customerName ?? "Walk-in"}</p>
                <p className="text-xs text-gray-500">{TYPE_LABEL[order.orderType]}</p>
              </td>
              <td className="py-3 pr-4 whitespace-nowrap text-gray-600">{formatDateTime(order.createdAt)}</td>
              <td className="py-3 pr-4 text-right font-semibold text-gray-900">{formatMoney(order.amount)}</td>
              <td className="py-3 pr-4 text-gray-600">
                {order.paymentMethod ? METHOD_LABEL[order.paymentMethod] : "Unpaid"}
              </td>
              <td className="py-3">
                <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[order.status]}`}>
                  {STATUS_LABEL[order.status]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
