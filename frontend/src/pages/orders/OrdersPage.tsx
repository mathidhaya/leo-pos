import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus, Search } from "lucide-react";
import { listOrders } from "../../api/orders";
import OrderDetailModal from "../../components/orders/OrderDetailModal";
import OrderStatusBadge from "../../components/orders/OrderStatusBadge";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import SelectField from "../../components/ui/SelectField";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "../../hooks/useDebounce";
import type { OrderListItem, OrderStatus, OrderType } from "../../types/orders";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatMoney, formatOrderNo, toYmd } from "../../utils/format";
import { METHOD_LABEL, TYPE_LABEL } from "../../utils/orderLabels";

const PAGE_SIZE = 20;

type Preset = "today" | "yesterday" | "week" | "month" | "all" | "custom";
type PaymentFilter = "all" | "UNPAID" | "CASH" | "UPI" | "CARD" | "OTHER";

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

function computeRange(preset: Preset, customFrom: string, customTo: string): { from?: string; to?: string; error?: string } {
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return toYmd(d);
  };

  switch (preset) {
    case "today":
      return { from: toYmd(now), to: toYmd(now) };
    case "yesterday":
      return { from: daysAgo(1), to: daysAgo(1) };
    case "week":
      return { from: daysAgo(6), to: toYmd(now) };
    case "month":
      return { from: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), to: toYmd(now) };
    case "all":
      return {};
    case "custom":
      if (!customFrom || !customTo) return { error: "Choose both a start and an end date." };
      if (customFrom > customTo) return { error: "The start date must not be after the end date." };
      return { from: customFrom, to: customTo };
  }
}

function PaymentCell({ order }: { order: OrderListItem }) {
  if (order.paymentStatus === "UNPAID") return <span className="font-medium text-amber-700">Unpaid</span>;
  if (order.paymentStatus === "REFUNDED") return <span className="text-gray-600">Refunded</span>;
  return <span className="text-gray-600">{order.paymentMethod ? METHOD_LABEL[order.paymentMethod] : "Paid"}</span>;
}

function Customer({ order }: { order: OrderListItem }) {
  return (
    <>
      <p className="text-gray-900">{order.customerName ?? "Walk-in"}</p>
      <p className="text-xs text-gray-500">
        {TYPE_LABEL[order.orderType]}
        {order.tableNo ? ` · table ${order.tableNo}` : ""}
        {order.customerPhone ? ` · ${order.customerPhone}` : ""}
      </p>
    </>
  );
}

export default function OrdersPage() {
  const { user } = useAuth();
  const canCreate = user?.role === "OWNER" || user?.role === "CASHIER";

  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [orderType, setOrderType] = useState<OrderType | "all">("all");
  const [payment, setPayment] = useState<PaymentFilter>("all");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const range = computeRange(preset, customFrom, customTo);

  const params = {
    q: debouncedSearch || undefined,
    from: range.from,
    to: range.to,
    status,
    orderType,
    payment,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["orders", params],
    queryFn: () => listOrders(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    enabled: !range.error,
  });

  const hasFilters = Boolean(debouncedSearch) || status !== "all" || orderType !== "all" || payment !== "all" || preset !== "today";

  function clearFilters() {
    setSearch("");
    setPreset("today");
    setStatus("all");
    setOrderType("all");
    setPayment("all");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Orders</h1>
          <p className="mt-1 text-sm text-gray-600">Track every order and move it from the counter to the customer.</p>
        </div>
        {canCreate && (
          <Link
            to="/pos"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-leo-600 px-6 text-base font-semibold text-white hover:bg-leo-700"
          >
            <Plus className="h-5 w-5" />
            New Order
          </Link>
        )}
      </div>

      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Date range">
          {PRESETS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={preset === item.key}
              onClick={() => {
                setPreset(item.key);
                setPage(1);
              }}
              className={[
                "h-10 rounded-full px-4 text-sm font-medium transition-colors",
                preset === item.key
                  ? "bg-leo-600 text-white"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl bg-leo-50 p-3">
            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">From</span>
              <input
                type="date"
                value={customFrom}
                max={toYmd(new Date())}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3"
              />
            </label>
            <label className="text-sm text-gray-700">
              <span className="mb-1 block font-medium">To</span>
              <input
                type="date"
                value={customTo}
                max={toYmd(new Date())}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-lg border border-gray-300 bg-white px-3"
              />
            </label>
            {range.error && (
              <p role="alert" className="w-full text-sm text-red-600">
                {range.error}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="order-search" className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                id="order-search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Order no., name or phone"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
              />
            </div>
          </div>

          <SelectField
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | "all");
              setPage(1);
            }}
          >
            <option value="all">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PREPARING">Preparing</option>
            <option value="READY">Ready</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </SelectField>

          <SelectField
            label="Order type"
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value as OrderType | "all");
              setPage(1);
            }}
          >
            <option value="all">All types</option>
            <option value="DINE_IN">Dine In</option>
            <option value="TAKE_AWAY">Take Away</option>
            <option value="DELIVERY">Delivery</option>
          </SelectField>

          <SelectField
            label="Payment"
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value as PaymentFilter);
              setPage(1);
            }}
          >
            <option value="all">All payments</option>
            <option value="UNPAID">Unpaid</option>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="OTHER">Other</option>
          </SelectField>
        </div>

        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-sm font-medium text-leo-700 hover:underline">
            Reset filters
          </button>
        )}
      </section>

      {!range.error && isPending && (
        <div className="space-y-3" role="status" aria-label="Loading orders">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      )}

      {!data && isError && (
        <div className="space-y-3">
          <Alert variant="error">{getErrorMessage(error)}</Alert>
          <Button onClick={() => void refetch()}>Try again</Button>
        </div>
      )}

      {data && isError && <Alert variant="error">{getErrorMessage(error)} Showing the last loaded list.</Alert>}

      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-500" />
          <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No orders match your filters" : "No orders yet today"}</p>
          <p className="text-sm text-gray-500">
            {hasFilters ? "Try a wider date range or clear the filters." : "New orders will appear here."}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? "opacity-60" : ""}>
          <p className="mb-2 text-sm text-gray-600">
            {data.total} order{data.total === 1 ? "" : "s"}
          </p>

          {/* Wide screens: table */}
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Date / time</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatOrderNo(order.orderNo)}</td>
                    <td className="px-4 py-3">
                      <Customer order={order} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(order.createdAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(order.amount)}</td>
                    <td className="px-4 py-3">
                      <PaymentCell order={order} />
                    </td>
                    <td className="px-4 py-3">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenId(order.id)}
                        aria-label={`View order ${formatOrderNo(order.orderNo)}`}
                        className="h-10 rounded-lg px-4 text-sm font-semibold text-leo-700 hover:bg-leo-50"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Small screens: cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(order.id)}
                  aria-label={`View order ${formatOrderNo(order.orderNo)}`}
                  className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{formatOrderNo(order.orderNo)}</p>
                      <Customer order={order} />
                    </div>
                    <p className="shrink-0 font-semibold text-gray-900">{formatMoney(order.amount)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{formatDateTime(order.createdAt)}</span>
                    <span className="flex items-center gap-2">
                      <PaymentCell order={order} />
                      <OrderStatusBadge status={order.status} />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
        </div>
      )}

      {openId && <OrderDetailModal orderId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
