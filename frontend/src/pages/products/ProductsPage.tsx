import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { listCategories } from "../../api/categories";
import { deleteProduct, listProducts, setProductAvailability } from "../../api/products";
import ProductFormModal from "../../components/catalog/ProductFormModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Pagination from "../../components/ui/Pagination";
import SelectField from "../../components/ui/SelectField";
import Toggle from "../../components/ui/Toggle";
import { useDebounce } from "../../hooks/useDebounce";
import type { Product, StockStatus } from "../../types/catalog";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/format";

const PAGE_SIZE = 20;

const STOCK_STYLE: Record<StockStatus, string> = {
  ok: "bg-leo-100 text-leo-700",
  low: "bg-amber-100 text-amber-800",
  out: "bg-red-100 text-red-700",
};

function StockBadge({ product }: { product: Product }) {
  const { status, quantity } = product.stock;
  const label = status === "out" ? "Out of stock" : status === "low" ? `Low: ${quantity}` : `In stock: ${quantity}`;
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STOCK_STYLE[status]}`}>
      {label}
    </span>
  );
}

function ProductThumb({ product }: { product: Product }) {
  return product.imageUrl ? (
    <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-leo-100 font-bold text-leo-700">
      {product.name.charAt(0).toUpperCase()}
    </span>
  );
}

export default function ProductsPage() {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [stock, setStock] = useState<"all" | "low" | "out">("all");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const debouncedSearch = useDebounce(search.trim());

  const params = {
    q: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    status,
    stock,
    page,
    pageSize: PAGE_SIZE,
  };

  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: listCategories });
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["products", params],
    queryFn: () => listProducts(params),
    placeholderData: keepPreviousData,
  });

  const categories = categoriesQuery.data ?? [];
  const hasFilters = Boolean(debouncedSearch || categoryId || status !== "all" || stock !== "all");

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
  }

  function clearFilters() {
    setSearch("");
    setCategoryId("");
    setStatus("all");
    setStock("all");
    setPage(1);
  }

  async function handleToggle(product: Product) {
    setTogglingId(product.id);
    setMessage(null);
    try {
      await setProductAvailability(product.id, !product.isAvailable);
      refresh();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(product: Product) {
    await deleteProduct(product.id);
    // If that was the last item on this page, go back one page
    if (data && data.items.length === 1 && page > 1) setPage(page - 1);
    setMessage({ kind: "success", text: `"${product.name}" was deleted.` });
    setDeleting(null);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Products</h1>
          <p className="mt-1 text-sm text-gray-600">Manage your menu, prices and stock levels.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-5 w-5" />
          Add product
        </Button>
      </div>

      {message && <Alert variant={message.kind}>{message.text}</Alert>}

      <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="product-search" className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                id="product-search"
                type="search"
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
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
          >
            <option value="all">All</option>
            <option value="active">Available</option>
            <option value="inactive">Disabled</option>
          </SelectField>

          <SelectField
            label="Stock"
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
        <div className="space-y-3" role="status" aria-label="Loading products">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-200" />
          ))}
        </div>
      )}

      {!data && isError && (
        <div className="space-y-3">
          <Alert variant="error">{getErrorMessage(error)}</Alert>
          <Button onClick={() => refetch()}>Try again</Button>
        </div>
      )}

      {data && isError && <Alert variant="error">{getErrorMessage(error)} Showing the last loaded list.</Alert>}

      {data && data.items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No products match your filters" : "No products yet"}</p>
          <p className="text-sm text-gray-500">
            {hasFilters ? "Try a different search or clear the filters." : "Add your first product to start selling."}
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
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Profit</th>
                  <th className="px-4 py-3 text-right font-medium">GST</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumb product={product} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">{product.name}</p>
                          <p className="truncate text-xs text-gray-500">
                            {product.sku} &middot; {product.category.name}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(product.sellingPrice)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {product.costPrice !== null ? formatMoney(product.costPrice) : "-"}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${
                        product.profit !== null && Number(product.profit) < 0 ? "text-red-600" : "text-leo-700"
                      }`}
                    >
                      {product.profit !== null ? formatMoney(product.profit) : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{Number(product.gstPercent)}%</td>
                    <td className="px-4 py-3">
                      <StockBadge product={product} />
                    </td>
                    <td className="px-4 py-3">
                      <Toggle
                        checked={product.isAvailable}
                        onChange={() => handleToggle(product)}
                        disabled={togglingId === product.id}
                        label={`${product.name} available`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing(product)}
                          aria-label={`Edit ${product.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(product)}
                          aria-label={`Delete ${product.name}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-5 w-5" />
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
            {data.items.map((product) => (
              <li key={product.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <ProductThumb product={product} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-gray-900">{product.name}</p>
                    <p className="truncate text-xs text-gray-500">
                      {product.sku} &middot; {product.category.name}
                    </p>
                  </div>
                  <p className="font-semibold text-gray-900">{formatMoney(product.sellingPrice)}</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                  <StockBadge product={product} />
                  {product.profit !== null && <span>Profit {formatMoney(product.profit)}</span>}
                  <span>GST {Number(product.gstPercent)}%</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <Toggle
                    checked={product.isAvailable}
                    onChange={() => handleToggle(product)}
                    disabled={togglingId === product.id}
                    label={`${product.name} available`}
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(product)}
                      aria-label={`Edit ${product.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(product)}
                      aria-label={`Delete ${product.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
        </div>
      )}

      {editing && (
        <ProductFormModal
          product={editing === "new" ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setMessage({ kind: "success", text: "Product saved." });
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete product"
          confirmLabel="Delete product"
          message={
            <>
              Delete <strong>{deleting.name}</strong>? Its stock history is deleted too. A product that has already
              been sold cannot be deleted. Disable it instead.
            </>
          }
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
