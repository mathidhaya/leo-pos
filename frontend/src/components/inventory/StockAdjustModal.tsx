import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, PackageMinus, PackagePlus, type LucideIcon } from "lucide-react";
import { adjustStock, type AdjustRequest } from "../../api/inventory";
import { getErrorMessage } from "../../utils/errors";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import TextField from "../ui/TextField";

export type AdjustAction = "IN" | "OUT" | "ADJUST";

export interface AdjustTarget {
  id: string;
  name: string;
  sku: string;
  quantity: number;
}

const MAX_STOCK = 1_000_000;

const TABS: Array<{ value: AdjustAction; label: string; Icon: LucideIcon }> = [
  { value: "IN", label: "Stock in", Icon: PackagePlus },
  { value: "OUT", label: "Stock out", Icon: PackageMinus },
  { value: "ADJUST", label: "Count", Icon: ClipboardCheck },
];

const REASONS: Record<AdjustAction, string[]> = {
  IN: ["Supplier delivery", "Returned stock", "Correction"],
  OUT: ["Wastage", "Damaged", "Expired", "Staff use"],
  ADJUST: ["Stock count", "Correction"],
};

interface Props {
  product: AdjustTarget;
  initialAction: AdjustAction;
  onClose: () => void;
  onDone: (message: string) => void;
}

export default function StockAdjustModal({ product, initialAction, onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  const current = product.quantity;

  const [action, setAction] = useState<AdjustAction>(initialAction);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // One key per set of values. Pressing Confirm twice (or retrying after a bad connection) can only
  // save one change. If anything is edited, the key changes, so the edit is never mistaken for a repeat.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const edited = () => {
    setIdempotencyKey(crypto.randomUUID());
    setError(null);
  };

  const trimmedAmount = amount.trim();
  const typed = trimmedAmount !== "";
  const parsed = /^\d{1,7}$/.test(trimmedAmount) ? Number(trimmedAmount) : null;
  const trimmedReason = reason.trim();

  let problem: string | null = null;
  let after: number | null = null;

  if (typed && parsed === null) {
    problem = "Enter a whole number.";
  } else if (parsed !== null) {
    if (action === "IN") {
      after = current + parsed;
      if (parsed < 1) problem = "Enter at least 1.";
      else if (after > MAX_STOCK) problem = `Stock cannot be more than ${MAX_STOCK.toLocaleString("en-IN")}.`;
    } else if (action === "OUT") {
      after = current - parsed;
      if (parsed < 1) problem = "Enter at least 1.";
      else if (parsed > current) problem = `Only ${current} in stock.`;
    } else {
      after = parsed;
      if (parsed > MAX_STOCK) problem = `Stock cannot be more than ${MAX_STOCK.toLocaleString("en-IN")}.`;
      else if (parsed === current) problem = "That is the same as the current stock.";
    }
  }

  const reasonRequired = action !== "IN";
  const reasonOk = reasonRequired ? trimmedReason.length >= 3 && trimmedReason.length <= 200 : trimmedReason.length <= 200;
  const canSubmit = parsed !== null && problem === null && reasonOk && !submitting;

  function switchAction(next: AdjustAction) {
    setAction(next);
    setAmount("");
    setReason("");
    edited();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (parsed === null || !canSubmit) return;

    const request: AdjustRequest =
      action === "ADJUST"
        ? {
            action,
            productId: product.id,
            newQuantity: parsed,
            expectedQuantity: current,
            reason: trimmedReason,
            idempotencyKey,
          }
        : {
            action,
            productId: product.id,
            quantity: parsed,
            reason: trimmedReason || undefined,
            idempotencyKey,
          };

    setSubmitting(true);
    setError(null);
    try {
      const item = await adjustStock(request);
      for (const key of ["inventory", "inventory-history", "pos-catalog", "products"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      onDone(`${item.name} stock is now ${item.quantity}.`);
    } catch (err) {
      setError(getErrorMessage(err));
      // The number on screen may be out of date: refresh the lists behind this window
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    } finally {
      setSubmitting(false);
    }
  }

  const diff = after === null ? null : after - current;

  return (
    <Modal title="Change stock" onClose={onClose} busy={submitting}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-center">
          <p className="font-semibold text-gray-900">{product.name}</p>
          <p className="text-xs text-gray-500">{product.sku}</p>
          <p className="mt-1 text-sm text-gray-600">
            In stock now: <strong className="text-gray-900">{current}</strong>
          </p>
        </div>

        <div role="radiogroup" aria-label="What do you want to do" className="grid grid-cols-3 gap-2">
          {TABS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={action === value}
              onClick={() => switchAction(value)}
              className={[
                "flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-medium transition-colors",
                action === value
                  ? "bg-leo-600 text-white"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
              ].join(" ")}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <TextField
            label={action === "ADJUST" ? "Counted quantity" : action === "IN" ? "Quantity to add" : "Quantity to remove"}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={7}
            hint={action === "ADJUST" ? "Type the number you counted on the shelf. The stock is set to exactly this." : undefined}
            value={amount}
            error={problem ?? undefined}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d]/g, ""));
              edited();
            }}
          />

          {after !== null && problem === null && diff !== null && (
            <div className="rounded-xl bg-leo-50 px-4 py-3 text-center text-sm text-gray-700">
              New stock: <strong className="text-lg text-leo-700">{after}</strong>
              <span className="ml-2 text-gray-500">({diff > 0 ? `+${diff}` : diff})</span>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <TextField
            label={reasonRequired ? "Reason" : "Reason (optional)"}
            autoComplete="off"
            maxLength={200}
            value={reason}
            error={reasonRequired && reason !== "" && trimmedReason.length < 3 ? "Please give a reason (at least 3 characters)." : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              edited();
            }}
          />
          <div className="flex flex-wrap gap-2">
            {REASONS[action].map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => {
                  setReason(text);
                  edited();
                }}
                className="h-9 rounded-full border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-leo-50"
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!canSubmit}>
            {submitting ? "Saving..." : action === "IN" ? "Add stock" : action === "OUT" ? "Remove stock" : "Save count"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
