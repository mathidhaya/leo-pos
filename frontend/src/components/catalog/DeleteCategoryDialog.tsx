import { useState } from "react";
import { deleteCategory } from "../../api/categories";
import type { Category } from "../../types/catalog";
import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import SelectField from "../ui/SelectField";

interface Props {
  category: Category;
  others: Category[]; // the other categories products can be moved to
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteCategoryDialog({ category, others, onClose, onDeleted }: Props) {
  const hasProducts = category.productCount > 0;
  const [target, setTarget] = useState(others.find((c) => c.isActive)?.id ?? others[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cannotMove = hasProducts && others.length === 0;

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteCategory(category.id, hasProducts ? target : undefined);
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Delete category" onClose={onClose} busy={busy}>
      <div className="space-y-4">
        {error && <Alert variant="error">{error}</Alert>}

        {!hasProducts && (
          <p className="text-sm text-gray-700">
            Delete <strong>{category.name}</strong>? This cannot be undone.
          </p>
        )}

        {hasProducts && !cannotMove && (
          <>
            <p className="text-sm text-gray-700">
              <strong>{category.name}</strong> has {category.productCount} product
              {category.productCount === 1 ? "" : "s"}. Choose a category to move{" "}
              {category.productCount === 1 ? "it" : "them"} to before it is deleted.
            </p>
            <SelectField label="Move products to" value={target} onChange={(e) => setTarget(e.target.value)}>
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive ? "" : " (disabled)"}
                </option>
              ))}
            </SelectField>
          </>
        )}

        {cannotMove && (
          <Alert variant="info">
            This is your only category and it has products. Add another category first, then you can move the
            products and delete this one.
          </Alert>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy} autoFocus>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} loading={busy} disabled={cannotMove}>
            {hasProducts ? "Move products and delete" : "Delete category"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
