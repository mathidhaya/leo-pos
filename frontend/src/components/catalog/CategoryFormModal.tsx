import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createCategory, updateCategory } from "../../api/categories";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import ImageUpload from "../ui/ImageUpload";
import Modal from "../ui/Modal";
import TextField from "../ui/TextField";
import Toggle from "../ui/Toggle";
import type { Category } from "../../types/catalog";
import { categoryFormSchema, type CategoryFormValues } from "../../utils/catalogValidation";
import { getErrorMessage } from "../../utils/errors";

interface Props {
  category: Category | null; // null = adding a new one
  onClose: () => void;
  onSaved: () => void;
}

export default function CategoryFormModal({ category, onClose, onSaved }: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(category?.imageUrl ?? null);
  const [isActive, setIsActive] = useState(category?.isActive ?? true);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: category?.name ?? "" },
  });

  const submit = handleSubmit(async ({ name }) => {
    setFormError(null);
    try {
      const payload = { name, imageUrl, isActive };
      if (category) await updateCategory(category.id, payload);
      else await createCategory(payload);
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <Modal title={category ? "Edit category" : "Add category"} onClose={onClose} busy={isSubmitting}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField label="Category name" autoFocus error={errors.name?.message} {...register("name")} />

        <ImageUpload label="Image or icon (optional)" value={imageUrl} onChange={setImageUrl} onUploadingChange={setUploading} />

        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Enabled</p>
            <p className="text-xs text-gray-500">Disabled categories are hidden from the order screen.</p>
          </div>
          <Toggle checked={isActive} onChange={setIsActive} label="Category enabled" />
        </div>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" loading={isSubmitting} disabled={uploading}>
            {isSubmitting ? "Saving..." : "Save category"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
