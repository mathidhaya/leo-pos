import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Receipt, Search } from "lucide-react";
import { listInvoices } from "../../api/invoices";
import InvoiceModal from "../../components/invoices/InvoiceModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DateRangeFilter from "../../components/ui/DateRangeFilter";
import Pagination from "../../components/ui/Pagination";
import { useDebounce } from "../../hooks/useDebounce";
import type { InvoiceRow, PaymentMethod } from "../../types/payments";
import { computeRange, type Preset } from "../../utils/datePresets";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatOrderNo } from "../../utils/format";
import { formatRupeesText } from "../../utils/money";

const PAGE_SIZE = 20;
const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" };

function Status({ row }: { row: InvoiceRow }) {
  return row.voided ? (
    <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">Cancelled / refunded</span>
  ) : (
    <span className="rounded-full bg-leo-100 px-2.5 py-1 text-xs font-medium text-leo-700">Paid</span>
  );
}

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const range = computeRange(preset, customFrom, customTo);

  const params = { q: debouncedSearch || undefined, from: range.from, to: range.to, page, pageSize: PAGE_SIZE };

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["invoices", params],
    queryFn: () => listInvoices(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    enabled: !range.error,
  });

  const hasFilters = Boolean(debouncedSearch) || preset !== "today";

  function clearFilters() {
    setSearch("");
    setPreset("today");
    setPage(1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Invoices</h1>
        <p className="mt-1 text-sm text-gray-600">Find an invoice to view, print again, or download.</p>
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

        <div className="max-w-md">
          <label htmlFor="invoice-search" className="mb-1.5 block text-sm font-medium text-gray-700">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input
              id="invoice-search"
              type="search"
              autoComplete="off"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Invoice no., order no., name or phone"
              className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
            />
          </div>
        </div>

        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-sm font-medium text-leo-700 hover:underline">
            Reset filters
          </button>
        )}
      </section>

      {!range.error && isPending && (
        <div className="space-y-3" role="status" aria-label="Loading invoices">
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
          <Receipt className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No invoices match your filters" : "No invoices yet today"}</p>
          <p className="text-sm text-gray-500">{hasFilters ? "Try a wider date range or clear the filters." : "An invoice is created when an order is paid."}</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? "opacity-60" : ""}>
          <p className="mb-2 text-sm text-gray-600">
            {data.total} invoice{data.total === 1 ? "" : "s"}
          </p>

          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Invoice</th>
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
                {data.items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 font-semibold text-gray-900">{row.invoiceNo}</td>
                    <td className="px-4 py-3 text-gray-600">{formatOrderNo(row.orderNo)}</td>
                    <td className="px-4 py-3 text-gray-900">{row.customerName ?? "Walk-in"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(row.issuedAt)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatRupeesText(row.total)}</td>
                    <td className="px-4 py-3 text-gray-600">{row.paymentMethod ? METHOD_LABEL[row.paymentMethod] : "-"}</td>
                    <td className="px-4 py-3">
                      <Status row={row} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setOpenId(row.id)}
                        aria-label={`Open invoice ${row.invoiceNo}`}
                        className="h-10 rounded-lg px-4 text-sm font-semibold text-leo-700 hover:bg-leo-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {data.items.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  aria-label={`Open invoice ${row.invoiceNo}`}
                  className="block w-full rounded-2xl bg-white p-4 text-left shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">{row.invoiceNo}</p>
                      <p className="text-xs text-gray-500">
                        {formatOrderNo(row.orderNo)} · {row.customerName ?? "Walk-in"}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-gray-900">{formatRupeesText(row.total)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{formatDateTime(row.issuedAt)}</span>
                    <Status row={row} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
        </div>
      )}

      {openId && <InvoiceModal invoiceId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
