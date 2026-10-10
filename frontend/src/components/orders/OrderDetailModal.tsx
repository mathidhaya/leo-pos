import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getOrder, updateOrderStatus } from "../../api/orders";
import { useAuth } from "../../hooks/useAuth";
import type { OrderStatus } from "../../types/orders";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatMoney, formatOrderNo } from "../../utils/format";
import { ACTION_LABEL, METHOD_LABEL, TYPE_LABEL } from "../../utils/orderLabels";
import InvoiceModal from "../invoices/InvoiceModal";
import PaymentModal from "../payments/PaymentModal";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Modal from "../ui/Modal";
import OrderStatusBadge from "./OrderStatusBadge";

interface Props {
  orderId: string;
  onClose: () => void;
}

export default function OrderDetailModal({ orderId, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canHandleMoney = user?.role === "OWNER" || user?.role === "CASHIER";

  const { data: order, isPending, isError, error, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId),
  });

  const [busy, setBusy] = useState<OrderStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paying, setPaying] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  // Orders, stock (the order screen), payments, invoices and the dashboard can all change
  function refreshEverything() {
    for (const key of ["orders", "order", "pos-catalog", "dashboard", "payments", "invoices"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  async function changeStatus(status: OrderStatus) {
    setBusy(status);
    setActionError(null);
    try {
      await updateOrderStatus(orderId, status);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy(null);
      refreshEverything();
    }
  }

  const forward = order ? order.actions.filter((action) => action !== "CANCELLED") : [];
  const canCancel = order ? order.actions.includes("CANCELLED") : false;
  const isPaid = order?.paymentStatus === "PAID";
  const stillOpen = order !== undefined && order.status !== "COMPLETED" && order.status !== "CANCELLED";
  const paymentLabel =
    order?.paymentStatus === "UNPAID" ? "Unpaid" : order?.paymentStatus === "PAID" ? "Paid" : "Refunded";
  const shownPayment = order?.payments[0];

  return (
    <>
      <Modal
        title={order ? `Order ${formatOrderNo(order.orderNo)}` : "Order"}
        onClose={onClose}
        busy={busy !== null || confirmCancel || paying || showInvoice}
        wide
      >
        {isPending && <p className="py-10 text-center text-sm text-gray-500">Loading order...</p>}

        {isError && (
          <div className="space-y-3">
            <Alert variant="error">{getErrorMessage(error)}</Alert>
            <Button onClick={() => void refetch()}>Try again</Button>
          </div>
        )}

        {order && (
          <div className="space-y-5">
            {actionError && <Alert variant="error">{actionError}</Alert>}

            <div className="flex flex-wrap items-center gap-3">
              <OrderStatusBadge status={order.status} />
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  order.paymentStatus === "UNPAID" ? "bg-amber-100 text-amber-800" : "bg-leo-100 text-leo-700"
                }`}
              >
                {paymentLabel}
                {shownPayment ? ` · ${METHOD_LABEL[shownPayment.method]}` : ""}
              </span>
              <span className="text-sm text-gray-500">{formatDateTime(order.createdAt)}</span>
            </div>

            <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-gray-50 px-4 py-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Type</dt>
                <dd className="font-medium text-gray-900">
                  {TYPE_LABEL[order.orderType]}
                  {order.tableNo ? ` · table ${order.tableNo}` : ""}
                  {order.guests ? ` · ${order.guests} ${order.guests === 1 ? "person" : "people"}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Taken by</dt>
                <dd className="font-medium text-gray-900">{order.cashier}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Customer</dt>
                <dd className="font-medium text-gray-900">
                  {order.customerName ?? "Walk-in"}
                  {order.customerPhone ? ` · ${order.customerPhone}` : ""}
                </dd>
              </div>
              {order.deliveryAddress && (
                <div>
                  <dt className="text-xs text-gray-500">Delivery address</dt>
                  <dd className="font-medium text-gray-900">{order.deliveryAddress}</dd>
                </div>
              )}
              {order.invoiceNo && (
                <div>
                  <dt className="text-xs text-gray-500">Invoice</dt>
                  <dd className="font-medium text-gray-900">{order.invoiceNo}</dd>
                </div>
              )}
            </dl>

            <ul className="divide-y divide-gray-100">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {item.name} <span className="text-gray-500">x {item.quantity}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatMoney(item.unitPrice)} each &middot; GST {Number(item.gstPercent)}%
                      {Number(item.discount) > 0 && ` · discount -${formatMoney(item.discount)}`}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-gray-900">{formatMoney(item.total)}</p>
                </li>
              ))}
            </ul>

            <dl className="space-y-1.5 border-t border-gray-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtotal</dt>
                <dd>{formatMoney(order.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Discount</dt>
                <dd className="text-leo-700">
                  {Number(order.discount) > 0 ? `-${formatMoney(order.discount)}` : formatMoney(order.discount)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">GST</dt>
                <dd>{formatMoney(order.tax)}</dd>
              </div>
              {Number(order.deliveryCharge) > 0 && (
                <div className="flex justify-between">
                  <dt className="text-gray-600">Delivery charge</dt>
                  <dd>{formatMoney(order.deliveryCharge)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                <dt className="text-base font-semibold text-gray-900">Grand Total</dt>
                <dd className="text-2xl font-bold text-leo-700">{formatMoney(order.grandTotal)}</dd>
              </div>
            </dl>

            {isPaid && stillOpen && !canCancel && (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
                This order is paid. Only the owner or a manager can cancel it and refund the customer.
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              {canCancel && (
                <Button variant="secondary" className="text-red-600" onClick={() => setConfirmCancel(true)} disabled={busy !== null}>
                  {isPaid ? "Cancel and refund" : "Cancel order"}
                </Button>
              )}
              {order.invoiceId && canHandleMoney && (
                <Button variant="secondary" onClick={() => setShowInvoice(true)} disabled={busy !== null}>
                  View / print invoice
                </Button>
              )}
              {forward.map((action) => (
                <Button
                  key={action}
                  variant="secondary"
                  loading={busy === action}
                  disabled={busy !== null && busy !== action}
                  onClick={() => void changeStatus(action)}
                >
                  {ACTION_LABEL[action]}
                </Button>
              ))}
              {order.canPay && canHandleMoney && (
                <Button onClick={() => setPaying(true)} disabled={busy !== null}>
                  Take payment · {formatMoney(order.grandTotal)}
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {confirmCancel && order && (
        <ConfirmDialog
          title={isPaid ? "Cancel and refund" : "Cancel order"}
          confirmLabel={isPaid ? "Cancel and refund" : "Cancel order"}
          message={
            isPaid ? (
              <>
                Cancel order <strong>{formatOrderNo(order.orderNo)}</strong> and refund{" "}
                <strong>{formatMoney(order.grandTotal)}</strong>? The payment is marked as refunded and the items go
                back into stock. Hand the money back to the customer yourself. This cannot be undone.
              </>
            ) : (
              <>
                Cancel order <strong>{formatOrderNo(order.orderNo)}</strong>? The items go back into stock. This cannot
                be undone.
              </>
            )
          }
          onConfirm={async () => {
            await updateOrderStatus(orderId, "CANCELLED");
            refreshEverything();
            setConfirmCancel(false);
          }}
          onCancel={() => setConfirmCancel(false)}
        />
      )}

      {paying && order && (
        <PaymentModal
          order={{ id: order.id, orderNo: order.orderNo, total: order.grandTotal }}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false);
            refreshEverything();
          }}
        />
      )}

      {showInvoice && order?.invoiceId && (
        <InvoiceModal invoiceId={order.invoiceId} onClose={() => setShowInvoice(false)} />
      )}
    </>
  );
}
