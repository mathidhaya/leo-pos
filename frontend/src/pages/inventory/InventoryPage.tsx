import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Boxes,
  ClipboardCheck,
  History as HistoryIcon,
  PackageMinus,
  PackagePlus,
  PackageX,
  Search,
  TriangleAlert,
} from "lucide-react";
import { listCategories } from "../../api/categories";
import { listInventory } from "../../api/inventory";
import StatCard from "../../components/dashboard/StatCard";
import InventoryHistory from "../../components/inventory/InventoryHistory";
import LowStockAlerts from "../../components/inventory/LowStockAlerts";
import StockAdjustModal, { type AdjustAction, type AdjustTarget } from "../../components/inventory/StockAdjustModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Pagination from "../../components/ui/Pagination";
import SelectField from "../../components/ui/SelectField";
import { useDebounce } from "../../hooks/useDebounce";
import type { InventoryItem, StockStatus } from "../../types/inventory";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime } from "../../utils/format";

const PAGE_SIZE = 20;

const STATUS_STYLE: Record<StockStatus, string> = {
  ok: "bg-leo-100 text-leo-700",
  low: "bg-amber-100 text-amber-800",
  out: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<StockStatus, string> = { ok: "In stock", low: "Low stock", out: "Out of stock" };

function StatusBadge({ status }: { status: StockStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function Thumb({ item }: { item: InventoryItem }) {
  return item.imageUrl ? (
    <img src={item.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-leo-100 font-bold text-leo-700">
      {item.name.charAt(0).toUpperCase()}
    </span>
  );
}

const iconButton =
  "flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-leo-600";

type Tab = "stock" | "history";

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("stock");

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stock, setStock] = useState<"all" | "low" | "out">("all");
  const [page, setPage] = useState(1);

  const [adjusting, setAdjusting] = useState<{ product: AdjustTarget; action: AdjustAction } | null>(null);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const params = {
    q: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    stock,
    page,
    pageSize: PAGE_SIZE,
  };

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["inventory", params],
    queryFn: () => listInventory(params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const categories = categoriesQuery.data ?? [];
  const hasFilters = Boolean(debouncedSearch || categoryId || stock !== "all");

  function clearFilters() {
    setSearch("");
    setCategoryId("");
    setStock("all");
    setPage(1);
  }

  function open(item: AdjustTarget, action: AdjustAction) {
    setMessage(null);
    setAdjusting({ product: { id: item.id, name: item.name, sku: item.sku, quantity: item.quantity }, action });
  }

  function showHistory(item: { id: string; name: string }) {
    setHistoryFor({ id: item.id, name: item.name });
    setTab("history");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Inventory</h1>
        <p className="mt-1 text-sm text-gray-600">Keep track of what is in stock, and what came in or went out.</p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Inventory views">
        {(
          [
            { key: "stock", label: "Stock" },
            { key: "history", label: "History" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={[
              "h-11 rounded-full px-6 text-sm font-medium transition-colors",
              tab === item.key
                ? "bg-leo-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message && <Alert variant="success">{message}</Alert>}

      {tab === "history" && <InventoryHistory product={historyFor} onClearProduct={() => setHistoryFor(null)} />}

      {tab === "stock" && (
        <>
          {data && (
            <>
              <section aria-label="Summary" className="grid grid-cols-3 gap-3 sm:gap-4">
                <StatCard label="Active products" value={String(data.summary.activeProducts)} icon={Boxes} tone="blue" hint="Available for sale" />
                <StatCard label="Low stock" value={String(data.summary.low)} icon={TriangleAlert} tone="amber" />
                <StatCard label="Out of stock" value={String(data.summary.outOfStock)} icon={PackageX} tone="red" />
              </section>

              <LowStockAlerts
                alerts={data.alerts}
                total={data.summary.low + data.summary.outOfStock}
                onAdd={(alert) => open(alert, "IN")}
              />
            </>
          )}

          <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-1">
                <label htmlFor="inventory-search" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Search
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
                  <input
                    id="inventory-search"
                    type="search"
                    autoComplete="off"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Name or product code"
                    className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
                  />
                </div>
              </div>

              <SelectField
                label="Category"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Stock level"
                value={stock}
                onChange={(e) => {
                  setStock(e.target.value as typeof stock);
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
              </SelectField>
            </div>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="mt-3 text-sm font-medium text-leo-700 hover:underline">
                Clear filters
              </button>
            )}
          </section>

          {isPending && (
            <div className="space-y-3" role="status" aria-label="Loading stock">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-200" />
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
              <Boxes className="mx-auto h-10 w-10 text-gray-500" />
              <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No products match your filters" : "No products yet"}</p>
              <p className="text-sm text-gray-500">
                {hasFilters ? "Try a different search or clear the filters." : "Add products in the Products page first."}
              </p>
            </div>
          )}

          {data && data.items.length > 0 && (
            <div className={isPlaceholderData ? "opacity-60" : ""}>
              {/* Wide screens: table */}
              <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 text-right font-medium">Stock</th>
                      <th className="px-4 py-3 text-right font-medium">Minimum</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Last 30 days</th>
                      <th className="px-4 py-3 font-medium">Last updated</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Thumb item={item} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-gray-900">
                                {item.name}
                                {!item.isAvailable && (
                                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                                    Disabled
                                  </span>
                                )}
                              </p>
                              <p className="truncate text-xs text-gray-500">
                                {item.sku} &middot; {item.category.name}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-base font-bold text-gray-900">{item.quantity}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{item.minStock}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                          <span className="font-medium text-leo-700">+{item.added30}</span>
                          <span className="mx-1 text-gray-500">/</span>
                          <span className="font-medium text-red-600">-{item.removed30}</span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                          {item.updatedAt ? formatDateTime(item.updatedAt) : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button type="button" className={iconButton} aria-label={`Stock in for ${item.name}`} title="Stock in" onClick={() => open(item, "IN")}>
                              <PackagePlus className="h-5 w-5 text-leo-700" />
                            </button>
                            <button type="button" className={iconButton} aria-label={`Stock out for ${item.name}`} title="Stock out" onClick={() => open(item, "OUT")}>
                              <PackageMinus className="h-5 w-5 text-red-600" />
                            </button>
                            <button type="button" className={iconButton} aria-label={`Count ${item.name}`} title="Count (set exact stock)" onClick={() => open(item, "ADJUST")}>
                              <ClipboardCheck className="h-5 w-5" />
                            </button>
                            <button type="button" className={iconButton} aria-label={`History of ${item.name}`} title="History" onClick={() => showHistory(item)}>
                              <HistoryIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Small screens: cards */}
              <ul className="space-y-3 md:hidden">
                {data.items.map((item) => (
                  <li key={item.id} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Thumb item={item} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-gray-900">{item.name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {item.sku} &middot; {item.category.name}
                          {!item.isAvailable && " · Disabled"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-gray-900">{item.quantity}</p>
                        <p className="text-xs text-gray-500">min {item.minStock}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                      <StatusBadge status={item.status} />
                      <span>
                        30 days: <span className="font-medium text-leo-700">+{item.added30}</span> /{" "}
                        <span className="font-medium text-red-600">-{item.removed30}</span>
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-gray-100 pt-3">
                      <button type="button" className={iconButton} aria-label={`Stock in for ${item.name}`} onClick={() => open(item, "IN")}>
                        <PackagePlus className="h-5 w-5 text-leo-700" />
                      </button>
                      <button type="button" className={iconButton} aria-label={`Stock out for ${item.name}`} onClick={() => open(item, "OUT")}>
                        <PackageMinus className="h-5 w-5 text-red-600" />
                      </button>
                      <button type="button" className={iconButton} aria-label={`Count ${item.name}`} onClick={() => open(item, "ADJUST")}>
                        <ClipboardCheck className="h-5 w-5" />
                      </button>
                      <button type="button" className={iconButton} aria-label={`History of ${item.name}`} onClick={() => showHistory(item)}>
                        <HistoryIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
            </div>
          )}
        </>
      )}

      {adjusting && (
        <StockAdjustModal
          product={adjusting.product}
          initialAction={adjusting.action}
          onClose={() => setAdjusting(null)}
          onDone={(text) => {
            setAdjusting(null);
            setMessage(text);
          }}
        />
      )}
    </div>
  );
}
