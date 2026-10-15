import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History as HistoryIcon, Search, X } from "lucide-react";
import { listMovements } from "../../api/inventory";
import type { Movement, MovementType } from "../../types/inventory";
import { computeRange, type Preset } from "../../utils/datePresets";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatOrderNo } from "../../utils/format";
import { useDebounce } from "../../hooks/useDebounce";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import DateRangeFilter from "../ui/DateRangeFilter";
import Pagination from "../ui/Pagination";
import SelectField from "../ui/SelectField";

const PAGE_SIZE = 20;

// An "in" that belongs to an order is stock coming back from a cancelled order
function kindOf(m: Movement): { label: string; style: string } {
  if (m.type === "SALE") return { label: "Sale", style: "bg-blue-100 text-blue-800" };
  if (m.type === "IN" && m.orderNo !== null) return { label: "Order cancelled", style: "bg-amber-100 text-amber-800" };
  if (m.type === "IN") return { label: "Stock in", style: "bg-leo-100 text-leo-700" };
  if (m.type === "OUT") return { label: "Stock out", style: "bg-red-100 text-red-700" };
  return { label: "Adjustment", style: "bg-indigo-100 text-indigo-800" };
}

function Kind({ movement }: { movement: Movement }) {
  const { label, style } = kindOf(movement);
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${style}`}>{label}</span>;
}

function Change({ value }: { value: number }) {
  return (
    <span className={`font-semibold ${value > 0 ? "text-leo-700" : "text-red-600"}`}>
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

interface Props {
  product: { id: string; name: string } | null;
  onClearProduct: () => void;
}

export default function InventoryHistory({ product, onClearProduct }: Props) {
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState<Preset>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [type, setType] = useState<"all" | MovementType>("all");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebounce(search.trim());
  const range = computeRange(preset, customFrom, customTo);

  const params = {
    q: debouncedSearch || undefined,
    productId: product?.id,
    from: range.from,
    to: range.to,
    type,
    page,
    pageSize: PAGE_SIZE,
  };

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["inventory-history", params],
    queryFn: () => listMovements(params),
    placeholderData: keepPreviousData,
    enabled: !range.error,
  });

  const hasFilters = Boolean(debouncedSearch) || type !== "all" || preset !== "week" || product !== null;

  function clearFilters() {
    setSearch("");
    setPreset("week");
    setType("all");
    setPage(1);
    onClearProduct();
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        {product && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-leo-50 px-4 py-2 text-sm text-leo-700">
            <span>
              Showing history for <strong>{product.name}</strong>
            </span>
            <button
              type="button"
              onClick={() => {
                onClearProduct();
                setPage(1);
              }}
              aria-label="Show all products"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-leo-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

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
            <label htmlFor="movement-search" className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
              <input
                id="movement-search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Product, code or reason"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
              />
            </div>
          </div>

          <SelectField
            label="Type"
            value={type}
            onChange={(e) => {
              setType(e.target.value as "all" | MovementType);
              setPage(1);
            }}
          >
            <option value="all">All movements</option>
            <option value="IN">Stock in</option>
            <option value="OUT">Stock out</option>
            <option value="ADJUST">Adjustments</option>
            <option value="SALE">Sales</option>
          </SelectField>
        </div>

        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-sm font-medium text-leo-700 hover:underline">
            Reset filters
          </button>
        )}
      </section>

      {!range.error && isPending && (
        <div className="space-y-3" role="status" aria-label="Loading history">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-gray-200" />
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
          <HistoryIcon className="mx-auto h-10 w-10 text-gray-500" />
          <p className="mt-3 font-medium text-gray-900">No stock movements found</p>
          <p className="text-sm text-gray-500">Try a wider date range or clear the filters.</p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? "opacity-60" : ""}>
          <p className="mb-2 text-sm text-gray-600">
            {data.total} movement{data.total === 1 ? "" : "s"}
          </p>

          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Date / time</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 text-right font-medium">Change</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                  <th className="px-4 py-3 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{row.productName}</p>
                      <p className="text-xs text-gray-500">{row.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Kind movement={row} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Change value={row.quantityChange} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {row.reason ?? "-"}
                      {row.orderNo !== null && <span className="ml-1 text-xs text-gray-500">({formatOrderNo(row.orderNo)})</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{row.by ?? "-"}</td>
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
                    <p className="font-semibold text-gray-900">{row.productName}</p>
                    <p className="text-xs text-gray-500">{formatDateTime(row.createdAt)}</p>
                  </div>
                  <span className="text-lg">
                    <Change value={row.quantityChange} />
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <Kind movement={row} />
                  <span>{row.reason ?? "-"}</span>
                  {row.orderNo !== null && <span>({formatOrderNo(row.orderNo)})</span>}
                  {row.by && <span>· {row.by}</span>}
                </div>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}
