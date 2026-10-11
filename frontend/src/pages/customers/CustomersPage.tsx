import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { deleteCustomer, listCustomers } from "../../api/customers";
import CustomerDetailModal from "../../components/customers/CustomerDetailModal";
import CustomerFormModal from "../../components/customers/CustomerFormModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Pagination from "../../components/ui/Pagination";
import SelectField from "../../components/ui/SelectField";
import { useAuth } from "../../hooks/useAuth";
import { useDebounce } from "../../hooks/useDebounce";
import type { Customer, CustomerSort } from "../../types/customers";
import { getErrorMessage } from "../../utils/errors";
import { formatDateTime, formatMoney } from "../../utils/format";
import { formatPhone } from "../../utils/phone";

const PAGE_SIZE = 20;

const iconButton =
  "flex h-10 w-10 items-center justify-center rounded-lg hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-leo-600";

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Cashiers can add and edit customers, but only the owner and managers can delete them
  const canDelete = user?.role === "OWNER" || user?.role === "MANAGER";

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<CustomerSort>("name");
  const [page, setPage] = useState(1);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | "new" | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search.trim());
  const params = { q: debouncedSearch || undefined, sort, page, pageSize: PAGE_SIZE };

  const { data, isPending, isError, error, refetch, isPlaceholderData } = useQuery({
    queryKey: ["customers", params],
    queryFn: () => listCustomers(params),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const hasFilters = Boolean(debouncedSearch) || sort !== "name";

  function refresh() {
    for (const key of ["customers", "customer", "customer-orders"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
    // Names on orders, payments and invoices come from the customer record
    for (const key of ["orders", "payments", "invoices", "dashboard"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  function clearFilters() {
    setSearch("");
    setSort("name");
    setPage(1);
  }

  async function handleDelete(customer: Customer) {
    await deleteCustomer(customer.id);
    if (data && data.items.length === 1 && page > 1) setPage(page - 1);
    if (viewingId === customer.id) setViewingId(null);
    setDeleting(null);
    setMessage(`"${customer.name}" was deleted. Their orders were kept.`);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Customers</h1>
          <p className="mt-1 text-sm text-gray-600">Everyone you serve, with what they have ordered and spent.</p>
        </div>
        <Button
          onClick={() => {
            setMessage(null);
            setEditing("new");
          }}
        >
          <Plus className="h-5 w-5" />
          Add customer
        </Button>
      </div>

      {message && <Alert variant="success">{message}</Alert>}

      <section className="rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="customer-search" className="mb-1.5 block text-sm font-medium text-gray-700">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                id="customer-search"
                type="search"
                autoComplete="off"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Name, phone number or email"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white pl-10 pr-3 text-base focus:border-leo-600 focus:outline-2 focus:outline-leo-600"
              />
            </div>
          </div>

          <SelectField
            label="Sort by"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as CustomerSort);
              setPage(1);
            }}
          >
            <option value="name">Name (A to Z)</option>
            <option value="recent">Latest order</option>
            <option value="orders">Most orders</option>
            <option value="spent">Highest spending</option>
            <option value="newest">Newest customers</option>
          </SelectField>
        </div>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="mt-3 text-sm font-medium text-leo-700 hover:underline">
            Clear filters
          </button>
        )}
      </section>

      {isPending && (
        <div className="space-y-3" role="status" aria-label="Loading customers">
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
          <Users className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-medium text-gray-900">{hasFilters ? "No customers match your search" : "No customers yet"}</p>
          <p className="text-sm text-gray-500">
            {hasFilters
              ? "Try a different search, or clear the filters."
              : "Add a customer, or enter a mobile number on an order and they are added automatically."}
          </p>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className={isPlaceholderData ? "opacity-60" : ""}>
          <p className="mb-2 text-sm text-gray-600">
            {data.total} customer{data.total === 1 ? "" : "s"}
          </p>

          {/* Wide screens: table */}
          <div className="hidden overflow-x-auto rounded-2xl bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-right font-medium">Total spending</th>
                  <th className="px-4 py-3 font-medium">Last order</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((customer) => (
                  <tr key={customer.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setViewingId(customer.id)}
                        aria-label={`View ${customer.name}`}
                        className="text-left"
                      >
                        <p className="font-semibold text-leo-700 hover:underline">{customer.name}</p>
                        {customer.email && <p className="text-xs text-gray-500">{customer.email}</p>}
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-700">{formatPhone(customer.phone)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{customer.orders}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(customer.spent)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {customer.lastOrderAt ? formatDateTime(customer.lastOrderAt) : <span className="text-gray-400">Never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          className={`${iconButton} text-gray-600`}
                          aria-label={`Edit ${customer.name}`}
                          onClick={() => {
                            setMessage(null);
                            setEditing(customer);
                          }}
                        >
                          <Pencil className="h-5 w-5" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            className={`${iconButton} text-red-600 hover:bg-red-50`}
                            aria-label={`Delete ${customer.name}`}
                            onClick={() => setDeleting(customer)}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Small screens: cards */}
          <ul className="space-y-3 md:hidden">
            {data.items.map((customer) => (
              <li key={customer.id} className="rounded-2xl bg-white p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setViewingId(customer.id)}
                  aria-label={`View ${customer.name}`}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{customer.name}</p>
                      <p className="text-sm text-gray-600">{formatPhone(customer.phone)}</p>
                    </div>
                    <p className="shrink-0 font-semibold text-gray-900">{formatMoney(customer.spent)}</p>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    {customer.orders} order{customer.orders === 1 ? "" : "s"} ·{" "}
                    {customer.lastOrderAt ? `last ${formatDateTime(customer.lastOrderAt)}` : "no orders yet"}
                  </p>
                </button>
                <div className="mt-3 flex items-center justify-end gap-1 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    className={`${iconButton} text-gray-600`}
                    aria-label={`Edit ${customer.name}`}
                    onClick={() => {
                      setMessage(null);
                      setEditing(customer);
                    }}
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  {canDelete && (
                    <button
                      type="button"
                      className={`${iconButton} text-red-600 hover:bg-red-50`}
                      aria-label={`Delete ${customer.name}`}
                      onClick={() => setDeleting(customer)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
        </div>
      )}

      {viewingId && (
        <CustomerDetailModal
          customerId={viewingId}
          onClose={() => setViewingId(null)}
          onEdit={(customer) => {
            setMessage(null);
            setEditing(customer);
          }}
          onDelete={canDelete ? (customer) => setDeleting(customer) : undefined}
        />
      )}

      {editing && (
        <CustomerFormModal
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setMessage("Customer saved.");
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete customer"
          confirmLabel="Delete customer"
          message={
            <>
              Delete <strong>{deleting.name}</strong>? Their orders are <strong>kept</strong> in your sales records under
              this name, but are no longer linked to a customer. An old invoice reprinted later will not show their phone
              number. This cannot be undone.
            </>
          }
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
