import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, IndianRupee, RotateCcw, Search, Smartphone, Wallet, Wallet as WalletIcon } from "lucide-react";
import { listPayments } from "../../api/payments";
import StatCard from "../../components/dashboard/StatCard";
import InvoiceModal from "../../components/invoices/InvoiceModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import Pagination from "../../components/ui/Pagination";
import SelectField from "../../components/ui/SelectField";
import { useDebounce } from "../../hooks/useDebounce";
import type { PaymentMethod, PaymentRow } from "../../types/payments";
import { computeRange, type Preset } from "../../utils/datePresets";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatMoney, formatOrderNo } from "../../utils/format";
import { formatRupeesText } from "../../utils/money";

const PAGE_SIZE = 20;

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" };
const METHOD_ICON = { CASH: Banknote, UPI: Smartphone, CARD: CreditCard, OTHER: Wallet } as const;

function Status({ row }: { row: PaymentRow }) {
  return row.refundedAt ? (
    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">Refunded</span>
  ) : (
    <span className="rounded-full bg-leo-100 px-2.5 py-1 text-xs font-medium text-leo-700">Paid</span>
  );
}

function CashDetails({ row }: { row: PaymentRow }) {
  if (row.method !== "CASH" || !row.amountReceived) return <span className="text-gray-500">-</span>;
  return (
    <span className="text-gray-600">
      {formatRupeesText(row.amountReceived)} received, {formatRupeesText(row.changeGiven)} change
    </span>
  );
}

export default function PaymentsPage() {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [method, setMethod] = useState<"all" | PaymentMethod>("all");
  const [page, setPage] = useState(1);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const range = computeRange(preset, customFrom, customTo);

  const params = { q: debouncedSearch || undefined, from: range.from, to: range.to, method, page, pageSize: PAGE_SIZE };

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["payments", params],
    queryFn: () => listPayments(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    enabled: !range.error,
  });

  const hasFilters = Boolean(debouncedSearch) || method !== "all" || preset !== "today";

  function clearFilters() {
    setSearch("");
    setPreset("today");
    setMethod("all");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Payments</h1>
        <p className="mt-1 text-sm text-gray-600">Money received, by payment method.</p>
      </div>

      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        <DateRangeFilter
          preset={preset}
          onPreset={(value) => {
            setPreset(value);
            setPage(1);
          }}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={(value) => {
            setCustomFrom(value);
            setPage(1);
          }}
          onCustomTo={(value) => {
            setCustomTo(value);
            setPage(1);
          }}
          error={range.error}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="payment-search" className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                id="payment-search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Invoice, order no., name or phone"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
              />
            </div>
          </div>

          <SelectField
            label="Payment method"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as "all" | PaymentMethod);
              setPage(1);
            }}
          >
            <option value="all">All methods</option>
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

      {data && (
        <section aria-label="Totals" className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 ${isPlaceholderData ? "opacity-60" : ""}`}>
          <StatCard label="Total collected" value={formatMoney(data.summary.collected)} icon={IndianRupee} tone="green" hint="Refunds not counted" />
          {data.summary.byMethod.map((item) => (
            <StatCard
              key={item.method}
              label={METHOD_LABEL[item.method]}
              value={formatMoney(item.total)}
              icon={METHOD_ICON[item.method] ?? WalletIcon}
              tone={item.method === "CASH" ? "blue" : item.method === "UPI" ? "green" : item.method === "CARD" ? "amber" : "gray"}
              hint={`${item.count} payment${item.count === 1 ? "" : "s"}`}
            />
          ))}
          <StatCard
            label="Refunded"
            value={formatMoney(data.summary.refunded.total)}
            icon={RotateCcw}
            tone="red"
            hint={`${data.summary.refunded.count} payment${data.summary.refunded.count === 1 ? "" : "s"}`}
          />
        </section>
      )}

      {!range.error && isPending && (
        <div className="space-y-3" role="status" aria-label="Loading payments">
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
          <Wallet className="mx-auto h-10 w-10 text-gray-500" />
          <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No payments match your filters" : "No payments yet today"}</p>
          <p className="text-sm text-gray-500">{hasFilters ? "Try a wider date range or clear the filters." : "Payments will appear here."}</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? "opacity-60" : ""}>
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Date / time</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Cash details</th>
                  <th className="px-4 py-3 font-medium">Taken by</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">
                    <span className="sr-only">Invoice</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{formatOrderNo(row.orderNo)}</p>
                      <p className="text-xs text-gray-500">{row.customerName ?? "Walk-in"}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{METHOD_LABEL[row.method]}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatRupeesText(row.amount)}</td>
                    <td className="px-4 py-3 text-xs">
                      <CashDetails row={row} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.cashier}</td>
                    <td className="px-4 py-3">
                      <Status row={row} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.invoiceId && (
                        <button
                          type="button"
                          onClick={() => setInvoiceId(row.invoiceId)}
                          aria-label={`View invoice ${row.invoiceNo}`}
                          className="h-10 rounded-lg px-4 text-sm font-semibold text-leo-700 hover:bg-leo-50"
                        >
                          {row.invoiceNo}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.items.map((row) => (
              <li key={row.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">
                      {formatOrderNo(row.orderNo)} <span className="font-normal text-gray-500">· {METHOD_LABEL[row.method]}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.customerName ?? "Walk-in"} · {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold text-gray-900">{formatRupeesText(row.amount)}</p>
                </div>
                <div className="mt-2 text-xs">
                  <CashDetails row={row} />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Status row={row} />
                  {row.invoiceId && (
                    <button
                      type="button"
                      onClick={() => setInvoiceId(row.invoiceId)}
                      aria-label={`View invoice ${row.invoiceNo}`}
                      className="h-10 rounded-lg px-3 text-sm font-semibold text-leo-700 hover:bg-leo-50"
                    >
                      {row.invoiceNo}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
        </div>
      )}

      {invoiceId && <InvoiceModal invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />}
    </div>
  );
}
