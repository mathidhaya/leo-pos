import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProduct, updateProduct } from "../../api/products";
import type { Category, Product } from "../../types/catalog";
import { productFormSchema, type ProductFormValues } from "../../utils/catalogValidation";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney } from "../../utils/format";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import ImageUpload from "../ui/ImageUpload";
import Modal from "../ui/Modal";
import SelectField from "../ui/SelectField";
import TextAreaField from "../ui/TextAreaField";
import TextField from "../ui/TextField";
import Toggle from "../ui/Toggle";

interface Props {
  product: Product | null; // null = adding a new one
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

// "150.50" -> 15050 paise. Returns null while the text is not a valid amount yet.
function toPaise(value: string): number | null {
  const text = value.trim();
  return /^\d{1,7}(\.\d{1,2})?$/.test(text) ? Math.round(Number(text) * 100) : null;
}

export default function ProductFormModal({ product, categories, onClose, onSaved }: Props) {
  const isEdit = product !== null;
  const [imageUrl, setImageUrl] = useState<string | null>(product?.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      categoryId: product?.category.id ?? "",
      description: product?.description ?? "",
      sellingPrice: product?.sellingPrice ?? "",
      costPrice: product?.costPrice ?? "",
      gstPercent: product ? String(Number(product.gstPercent)) : "5",
      stockQuantity: product ? String(product.stock.quantity) : "0",
      minStock: product ? String(product.stock.minStock) : "10",
      prepTimeMin: product?.prepTimeMin === null || product === null ? "" : String(product.prepTimeMin),
      isAvailable: product?.isAvailable ?? true,
    },
  });

  // Only enabled categories can be chosen, plus the one this product already has
  const categoryOptions = categories.filter((c) => c.isActive || c.id === product?.category.id);

  // Profit is calculated from what is typed, as it is typed
  const selling = toPaise(watch("sellingPrice"));
  const cost = toPaise(watch("costPrice"));
  const profit = selling !== null && cost !== null ? selling - cost : null;
  const margin = profit !== null && selling !== null && selling > 0 ? (profit / selling) * 100 : null;
  const isAvailable = watch("isAvailable");

  const submit = handleSubmit(async (values) => {
    setFormError(null);

    const payload = {
      name: values.name,
      sku: values.sku,
      categoryId: values.categoryId,
      description: values.description,
      imageUrl,
      sellingPrice: values.sellingPrice,
      costPrice: values.costPrice,
      gstPercent: values.gstPercent,
      prepTimeMin: values.prepTimeMin === "" ? null : Number(values.prepTimeMin),
      minStock: Number(values.minStock),
      isAvailable: values.isAvailable,
    };

    try {
      if (product) await updateProduct(product.id, payload);
      else await createProduct({ ...payload, stockQuantity: Number(values.stockQuantity) });
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <Modal title={isEdit ? "Edit product" : "Add product"} onClose={onClose} busy={isSubmitting} wide>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}
        {categoryOptions.length === 0 && (
          <Alert variant="info">There is no enabled category yet. Add or enable a category first.</Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Product name" autoFocus error={errors.name?.message} {...register("name")} />
          <TextField
            label="Product code (SKU)"
            hint={isEdit ? undefined : "Leave blank to create one automatically."}
            error={errors.sku?.message}
            {...register("sku")}
          />
        </div>

        <SelectField label="Category" error={errors.categoryId?.message} {...register("categoryId")}>
          <option value="">Choose a category</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.isActive ? "" : " (disabled)"}
            </option>
          ))}
        </SelectField>

        <TextAreaField
          label="Description (optional)"
          error={errors.description?.message}
          {...register("description")}
        />

        <ImageUpload label="Product image (optional)" value={imageUrl} onChange={setImageUrl} onUploadingChange={setUploading} />

        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Selling price (₹)"
            inputMode="decimal"
            error={errors.sellingPrice?.message}
            {...register("sellingPrice")}
          />
          <TextField
            label="Cost price (₹)"
            inputMode="decimal"
            error={errors.costPrice?.message}
            {...register("costPrice")}
          />
          <TextField
            label="GST (%)"
            inputMode="decimal"
            error={errors.gstPercent?.message}
            {...register("gstPercent")}
          />
        </div>

        {profit !== null && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              profit < 0 ? "bg-red-50 text-red-700" : "bg-leo-50 text-leo-700"
            }`}
          >
            Profit per item: <strong>{formatMoney(profit / 100)}</strong>
            {margin !== null && ` (${margin.toFixed(0)}% margin)`}
            {profit < 0 && ". The cost is higher than the selling price."}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          {isEdit ? (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Stock</span>
              <div className="flex h-12 items-center rounded-xl bg-gray-50 px-4 text-base font-semibold text-gray-900">
                {product.stock.quantity}
              </div>
              <p className="mt-1.5 text-xs text-gray-500">To change stock, use Inventory (coming in Phase 9).</p>
            </div>
          ) : (
            <TextField
              label="Opening stock"
              inputMode="numeric"
              error={errors.stockQuantity?.message}
              {...register("stockQuantity")}
            />
          )}
          <TextField
            label="Minimum stock"
            inputMode="numeric"
            hint="Low-stock alerts use this."
            error={errors.minStock?.message}
            {...register("minStock")}
          />
          <TextField
            label="Preparation time (min)"
            inputMode="numeric"
            error={errors.prepTimeMin?.message}
            {...register("prepTimeMin")}
          />
        </div>

        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Available for sale</p>
            <p className="text-xs text-gray-500">Turn off to hide this product from the order screen.</p>
          </div>
          <Toggle
            checked={isAvailable}
            onChange={(checked) => setValue("isAvailable", checked)}
            label="Product available"
          />
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={uploading}>
            {isSubmitting ? "Saving..." : "Save product"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
