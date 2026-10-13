import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateShop } from "../../api/settings";
import { useFlash } from "../../hooks/useFlash";
import type { ShopSettings } from "../../types/settings";
import { getErrorMessage } from "../../utils/errors";
import { shopFormSchema, type ShopFormValues } from "../../utils/settingsValidation";
import Alert from "../ui/Alert";
import ImageUpload from "../ui/ImageUpload";
import TextAreaField from "../ui/TextAreaField";
import TextField from "../ui/TextField";
import FormActions from "./FormActions";
import SettingsCard from "./SettingsCard";

const toForm = (shop: ShopSettings): ShopFormValues => ({
  name: shop.name,
  address: shop.address ?? "",
  phone: shop.phone ?? "",
  email: shop.email ?? "",
  gstNumber: shop.gstNumber ?? "",
});

interface Props {
  shop: ShopSettings;
  onSaved: () => void;
}

export default function CafeTab({ shop, onSaved }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(shop.logoUrl);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ShopFormValues>({ resolver: zodResolver(shopFormSchema), defaultValues: toForm(shop) });

  // When the saved details change (after a save), the form starts from them again
  useEffect(() => {
    reset(toForm(shop));
    setLogoUrl(shop.logoUrl);
  }, [shop, reset]);

  const dirty = isDirty || logoUrl !== shop.logoUrl;

  function discard() {
    reset(toForm(shop));
    setLogoUrl(shop.logoUrl);
    setFormError(null);
  }

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updateShop({ ...values, logoUrl });
      setFlash("Cafe details saved.");
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {flash && <Alert variant="success">{flash}</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}

      <SettingsCard title="Cafe profile" description="These details appear on your receipts.">
        <div className="space-y-5">
          <ImageUpload label="Logo (optional)" value={logoUrl} onChange={setLogoUrl} onUploadingChange={setUploading} />

          <TextField label="Cafe name" autoComplete="off" error={errors.name?.message} {...register("name")} />

          <TextAreaField label="Address" error={errors.address?.message} {...register("address")} />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Phone"
              inputMode="tel"
              autoComplete="off"
              hint="Shown on receipts."
              error={errors.phone?.message}
              {...register("phone")}
            />
            <TextField label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register("email")} />
          </div>

          <TextField
            label="GST number (optional)"
            autoComplete="off"
            maxLength={15}
            className="uppercase"
            hint="15 characters. Printed on receipts when 'Show GST number' is on (Receipt tab)."
            error={errors.gstNumber?.message}
            {...register("gstNumber")}
          />
        </div>
      </SettingsCard>

      <FormActions dirty={dirty && !uploading} saving={isSubmitting} onDiscard={discard} />
    </form>
  );
}
