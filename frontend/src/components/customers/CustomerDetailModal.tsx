import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Mail, MapPin, Pencil, Phone, Trash2 } from "lucide-react";
import { getCustomer, listCustomerOrders } from "../../api/customers";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatMoney, formatOrderNo } from "../../utils/format";
import { METHOD_LABEL, TYPE_LABEL } from "../../utils/orderLabels";
import { formatPhone } from "../../utils/phone";
import type { Customer } from "../../types/customers";
import OrderDetailModal from "../orders/OrderDetailModal";
import OrderStatusBadge from "../orders/OrderStatusBadge";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Pagination from "../ui/Pagination";

const PAGE_SIZE = 10;

interface Props {
  customerId: string;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
  onDelete?: (customer: Customer) => void; // left out when this person may not delete
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-gray-50 px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold text-gray-900">{value}</p>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export default function CustomerDetailModal({ customerId, onClose, onEdit, onDelete }: Props) {
  const [page, setPage] = useState(1);
  const [orderId, setOrderId] = useState<string | null>(null);

  const customerQuery = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => getCustomer(customerId),
  });

  const ordersQuery = useQuery({
    queryKey: ["customer-orders", customerId, page],
    queryFn: () => listCustomerOrders(customerId, page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  });

  const customer = customerQuery.data;
  const orders = ordersQuery.data;
  const since = customer
    ? new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";

  return (
    <>
      <Modal title={customer ? customer.name : "Customer"} onClose={onClose} wide>
        {customerQuery.isPending && <p className="py-10 text-center text-sm text-gray-500">Loading customer...</p>}

        {customerQuery.isError && (
          <div className="space-y-3">
            <Alert variant="error">{getErrorMessage(customerQuery.error)}</Alert>
            <Button onClick={() => void customerQuery.refetch()}>Try again</Button>
          </div>
        )}

        {customer && (
          <div className="space-y-5">
            <div className="space-y-1.5 text-sm text-gray-700">
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-gray-500" />
                {formatPhone(customer.phone)}
              </p>
              {customer.email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-gray-500" />
                  <span className="break-all">{customer.email}</span>
                </p>
              )}
              {customer.address && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <span>{customer.address}</span>
                </p>
              )}
              <p className="text-xs text-gray-500">Customer since {since}</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Tile label="Total orders" value={String(customer.orders)} hint="Not counting cancelled" />
              <Tile label="Total spending" value={formatMoney(customer.spent)} hint="Paid orders only" />
              <Tile
                label="Last order"
                value={customer.lastOrderAt ? formatDateTime(customer.lastOrderAt) : "No orders yet"}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              {onDelete && (
                <Button variant="secondary" className="text-red-600" onClick={() => onDelete(customer)}>
                  <Trash2 className="h-5 w-5" />
                  Delete
                </Button>
              )}
              <Button variant="secondary" onClick={() => onEdit(customer)}>
                <Pencil className="h-5 w-5" />
                Edit
              </Button>
            </div>

            <section aria-label="Order history">
              <h3 className="mb-2 text-base font-semibold text-gray-900">Order history</h3>

              {ordersQuery.isPending && <p className="py-6 text-center text-sm text-gray-500">Loading orders...</p>}

              {ordersQuery.isError && (
                <div className="space-y-3">
                  <Alert variant="error">{getErrorMessage(ordersQuery.error)}</Alert>
                  <Button onClick={() => void ordersQuery.refetch()}>Try again</Button>
                </div>
              )}

              {orders && orders.items.length === 0 && (
                <p className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
                  No orders yet. Orders placed with this mobile number will appear here.
                </p>
              )}

              {orders && orders.items.length > 0 && (
                <>
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {orders.items.map((order) => (
                      <li key={order.id}>
                        <button
                          type="button"
                          onClick={() => setOrderId(order.id)}
                          aria-label={`View order ${formatOrderNo(order.orderNo)}`}
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900">
                              {formatOrderNo(order.orderNo)}
                              <span className="ml-2 font-normal text-gray-500">{TYPE_LABEL[order.orderType]}</span>
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatDateTime(order.createdAt)} ·{" "}
                              {order.paymentStatus === "UNPAID"
                                ? "Unpaid"
                                : order.paymentStatus === "REFUNDED"
                                  ? "Refunded"
                                  : order.paymentMethod
                                    ? METHOD_LABEL[order.paymentMethod]
                                    : "Paid"}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-sm font-semibold text-gray-900">{formatMoney(order.amount)}</span>
                            <OrderStatusBadge status={order.status} />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={orders.page}
                    totalPages={orders.totalPages}
                    total={orders.total}
                    pageSize={orders.pageSize}
                    onPageChange={setPage}
                  />
                </>
              )}
            </section>
          </div>
        )}
      </Modal>

      {orderId && <OrderDetailModal orderId={orderId} onClose={() => setOrderId(null)} />}
    </>
  );
}
