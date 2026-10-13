import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateBilling } from "../../api/settings";
import { useFlash } from "../../hooks/useFlash";
import type { BillingSettings } from "../../types/settings";
import { getErrorMessage } from "../../utils/errors";
import { billingFormSchema, type BillingFormValues } from "../../utils/settingsValidation";
import Alert from "../ui/Alert";
import TextField from "../ui/TextField";
import FormActions from "./FormActions";
import SettingsCard from "./SettingsCard";

const toForm = (billing: BillingSettings): BillingFormValues => ({
  invoicePrefix: billing.invoicePrefix,
  defaultGst: String(Number(billing.defaultGst)),
  defaultDiscount: String(Number(billing.defaultDiscount)),
});

interface Props {
  billing: BillingSettings;
  onSaved: () => void;
}

export default function BillingTab({ billing, onSaved }: Props) {
  const [formError, setFormError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BillingFormValues>({ resolver: zodResolver(billingFormSchema), defaultValues: toForm(billing) });

  useEffect(() => {
    reset(toForm(billing));
  }, [billing, reset]);

  // A live example of what the next invoice number will look like
  const prefix = watch("invoicePrefix").trim().toUpperCase();
  const example = /^[A-Z0-9]{1,6}$/.test(prefix) ? `${prefix}-${String(billing.nextInvoiceNumber).padStart(6, "0")}` : null;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updateBilling(values);
      setFlash("Billing settings saved.");
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {flash && <Alert variant="success">{flash}</Alert>}
      {formError && <Alert variant="error">{formError}</Alert>}

      <SettingsCard title="Invoices" description="How your invoice numbers look.">
        <div className="space-y-4">
          <TextField
            label="Invoice prefix"
            autoComplete="off"
            maxLength={6}
            className="uppercase"
            hint="1 to 6 letters or numbers. It applies to new invoices only. Invoices you already issued keep their numbers."
            error={errors.invoicePrefix?.message}
            {...register("invoicePrefix")}
          />
          {example && (
            <p className="rounded-xl bg-leo-50 px-4 py-3 text-sm text-gray-700">
              Your next invoice will be <strong className="font-mono text-leo-700">{example}</strong>
            </p>
          )}
        </div>
      </SettingsCard>

      <SettingsCard title="Defaults" description="Starting values that save time. Staff can still change them.">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Default GST (%)"
              inputMode="decimal"
              autoComplete="off"
              hint="Used when you add a new product. Products you already have keep their own rate."
              error={errors.defaultGst?.message}
              {...register("defaultGst")}
            />
            <TextField
              label="Default discount (%)"
              inputMode="decimal"
              autoComplete="off"
              hint="Filled in on every new order. The cashier can change or clear it. Use 0 for none."
              error={errors.defaultDiscount?.message}
              {...register("defaultDiscount")}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700">Currency</span>
            <div className="flex h-12 items-center rounded-xl bg-gray-50 px-4 text-base text-gray-900">
              {billing.currency} &middot; Indian Rupee (₹)
            </div>
            <p className="mt-1.5 text-sm text-gray-500">
              Leo Cafe works in Indian rupees, because GST, phone numbers and receipts are set up for India.
            </p>
          </div>
        </div>
      </SettingsCard>

      <FormActions dirty={isDirty} saving={isSubmitting} onDiscard={() => reset(toForm(billing))} />
    </form>
  );
}
