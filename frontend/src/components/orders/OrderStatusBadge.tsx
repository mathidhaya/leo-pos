import type { OrderStatus } from "../../types/orders";
import { STATUS_LABEL, STATUS_STYLE } from "../../utils/orderLabels";

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
