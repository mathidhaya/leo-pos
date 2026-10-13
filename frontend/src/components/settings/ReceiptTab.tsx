import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Printer } from "lucide-react";
import { updateReceipt } from "../../api/settings";
import { useAuth } from "../../hooks/useAuth";
import { useFlash } from "../../hooks/useFlash";
import type { BillingSettings, ReceiptSettings, ShopSettings } from "../../types/settings";
import { getErrorMessage } from "../../utils/errors";
import { buildSampleInvoice } from "../../utils/sampleReceipt";
import { receiptFormSchema, type ReceiptFormValues } from "../../utils/settingsValidation";
import ReceiptView from "../invoices/ReceiptView";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import TextField from "../ui/TextField";
import Toggle from "../ui/Toggle";
import FormActions from "./FormActions";
import SettingsCard from "./SettingsCard";

const toForm = (receipt: ReceiptSettings): ReceiptFormValues => ({
  receiptFooter: receipt.receiptFooter,
  printerName: receipt.printerName ?? "",
  showGst: receipt.showGst,
  showCashier: receipt.showCashier,
});

interface Props {
  shop: ShopSettings;
  billing: BillingSettings;
  receipt: ReceiptSettings;
  onSaved: () => void;
}

export default function ReceiptTab({ shop, billing, receipt, onSaved }: Props) {
  const { user } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [flash, setFlash] = useFlash();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ReceiptFormValues>({ resolver: zodResolver(receiptFormSchema), defaultValues: toForm(receipt) });

  useEffect(() => {
    reset(toForm(receipt));
  }, [receipt, reset]);

  const footer = watch("receiptFooter");
  const showGst = watch("showGst");
  const showCashier = watch("showCashier");

  // The preview follows what is typed, before anything is saved
  const sample = useMemo(
    () =>
      buildSampleInvoice({
        shop,
        invoiceNo: `${billing.invoicePrefix}-${String(billing.nextInvoiceNumber).padStart(6, "0")}`,
        cashier: user?.name ?? "Cashier",
        footer: footer.trim() || "Thank you for visiting!",
        showGst,
        showCashier,
      }),
    [shop, billing, user?.name, footer, showGst, showCashier]
  );

  // A test print: the receipt is added to the page only while the print window is open
  useEffect(() => {
    if (!printing) return;
    const finished = () => setPrinting(false);
    window.addEventListener("afterprint", finished);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", finished);
    };
  }, [printing]);

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updateReceipt(values);
      setFlash("Receipt settings saved.");
      onSaved();
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <form onSubmit={submit} noValidate className="space-y-6">
        {flash && <Alert variant="success">{flash}</Alert>}
        {formError && <Alert variant="error">{formError}</Alert>}

        <SettingsCard title="Receipt text">
          <div className="space-y-5">
            <TextField
              label="Footer message"
              autoComplete="off"
              maxLength={120}
              hint="The last line of every receipt."
              error={errors.receiptFooter?.message}
              {...register("receiptFooter")}
            />

            <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Show GST number</p>
                <p className="text-xs text-gray-500">
                  Prints your GSTIN under the address.
                  {!shop.gstNumber && " Add your GST number in the Cafe tab first."}
                </p>
              </div>
              <Toggle
                checked={showGst}
                onChange={(checked) => setValue("showGst", checked, { shouldDirty: true })}
                label="Show GST number on receipts"
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">Show cashier name</p>
                <p className="text-xs text-gray-500">Prints who took the payment.</p>
              </div>
              <Toggle
                checked={showCashier}
                onChange={(checked) => setValue("showCashier", checked, { shouldDirty: true })}
                label="Show cashier name on receipts"
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Printer"
          description="Receipts are laid out for 80 mm thermal paper. Your browser lets you pick the printer in the print window."
        >
          <div className="space-y-4">
            <TextField
              label="Printer name (optional)"
              autoComplete="off"
              maxLength={60}
              hint="A reminder shown to staff when they print, for example 'Counter printer'."
              error={errors.printerName?.message}
              {...register("printerName")}
            />
            <Button type="button" variant="secondary" onClick={() => setPrinting(true)} disabled={printing}>
              <Printer className="h-5 w-5" />
              Print test receipt
            </Button>
          </div>
        </SettingsCard>

        <FormActions dirty={isDirty} saving={isSubmitting} onDiscard={() => reset(toForm(receipt))} />
      </form>

      <aside aria-label="Receipt preview" className="lg:sticky lg:top-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Preview (sample order)</p>
        <div className="flex justify-center overflow-x-auto rounded-2xl bg-gray-100 p-4">
          <ReceiptView invoice={sample} />
        </div>
      </aside>

      {printing &&
        createPortal(
          <div id="print-receipt">
            <ReceiptView invoice={sample} bare />
          </div>,
          document.body
        )}
    </div>
  );
}
