import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { updateCategory } from "../../api/categories";
import { listCategories } from "../../api/categories";
import CategoryFormModal from "../../components/catalog/CategoryFormModal";
import DeleteCategoryDialog from "../../components/catalog/DeleteCategoryDialog";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Toggle from "../../components/ui/Toggle";
import type { Category } from "../../types/catalog";
import { getErrorMessage } from "../../utils/errors";

function CategoryCardSkeleton() {
  return <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />;
}

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ["categories"],
    queryFn: listCategories,
  });

  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["categories"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  }

  async function handleToggle(category: Category) {
    setTogglingId(category.id);
    setMessage(null);
    try {
      await updateCategory(category.id, {
        name: category.name,
        imageUrl: category.imageUrl,
        isActive: !category.isActive,
      });
      refresh();
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Categories</h1>
          <p className="mt-1 text-sm text-gray-600">Group your menu so products are easy to find.</p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-5 w-5" />
          Add category
        </Button>
      </div>

      {message && <Alert variant={message.kind}>{message.text}</Alert>}

      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading categories">
          {Array.from({ length: 6 }, (_, i) => (
            <CategoryCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <div className="space-y-3">
          <Alert variant="error">{getErrorMessage(error)}</Alert>
          <Button onClick={() => refetch()}>Try again</Button>
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <Tags className="mx-auto h-10 w-10 text-gray-500" />
          <p className="mt-3 font-medium text-gray-900">No categories yet</p>
          <p className="text-sm text-gray-500">Add your first category, for example Coffee or Snacks.</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((category) => (
            <div
              key={category.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${category.isActive ? "" : "opacity-75"}`}
            >
              <div className="flex items-center gap-3">
                {category.imageUrl ? (
                  <img src={category.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-leo-100 text-xl font-bold text-leo-700">
                    {category.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{category.name}</p>
                  <p className="text-sm text-gray-500">
                    {category.productCount} product{category.productCount === 1 ? "" : "s"}
                  </p>
                  {!category.isActive && (
                    <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      Disabled
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
                <Toggle
                  checked={category.isActive}
                  onChange={() => handleToggle(category)}
                  disabled={togglingId === category.id}
                  label={`${category.name} enabled`}
                />
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(category)}
                    aria-label={`Edit ${category.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
                  >
                    <Pencil className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(category)}
                    aria-label={`Delete ${category.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CategoryFormModal
          category={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setMessage({ kind: "success", text: "Category saved." });
            setEditing(null);
            refresh();
          }}
        />
      )}

      {deleting && data && (
        <DeleteCategoryDialog
          category={deleting}
          others={data.filter((c) => c.id !== deleting.id)}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setMessage({ kind: "success", text: `"${deleting.name}" was deleted.` });
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
