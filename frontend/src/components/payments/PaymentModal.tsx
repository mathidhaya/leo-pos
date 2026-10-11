import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Banknote, CircleCheck, CreditCard, Printer, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { createPayment } from "../../api/payments";
import type { PaymentMethod, PaymentResult } from "../../types/payments";
import { paiseToDecimalString, parseMoneyToPaise } from "../../utils/billing";
import { getErrorCode, getErrorMessage } from "../../utils/errors";
import { formatOrderNo } from "../../utils/format";
import { formatRupees, formatRupeesText } from "../../utils/money";
import { calculatePayment, decimalTextToPaise } from "../../utils/paymentCalc";
import InvoiceModal from "../invoices/InvoiceModal";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import TextField from "../ui/TextField";

const METHODS: Array<{ value: PaymentMethod; label: string; Icon: LucideIcon }> = [
  { value: "CASH", label: "Cash", Icon: Banknote },
  { value: "UPI", label: "UPI", Icon: Smartphone },
  { value: "CARD", label: "Card", Icon: CreditCard },
  { value: "OTHER", label: "Other", Icon: Wallet },
];

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" };

// "Exact", then the bill rounded up to the next 50, 100, 500 and 1000 rupees
function cashSuggestions(totalPaise: number): number[] {
  const steps = [5000, 10000, 50000, 100000];
  const options = new Set<number>([totalPaise]);
  for (const step of steps) options.add(Math.ceil(totalPaise / step) * step);
  return [...options].filter((value) => value >= totalPaise).sort((a, b) => a - b).slice(0, 4);
}

interface Props {
  order: { id: string; orderNo: number; total: string };
  onClose: () => void; // closed without taking payment
  onDone: () => void; // closed after the payment was recorded
}

export default function PaymentModal({ order, onClose, onDone }: Props) {
  const queryClient = useQueryClient();
  // One key per dialog: pressing Confirm twice (or retrying after a bad connection) can only record one payment
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const totalPaise = decimalTextToPaise(order.total);
  const isFree = totalPaise === 0;

  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [received, setReceived] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);

  const effectiveMethod: PaymentMethod = isFree ? "OTHER" : method;
  const calc = calculatePayment(effectiveMethod, totalPaise, received);
  const receivedPaise = parseMoneyToPaise(received);

  function refresh() {
    for (const key of ["orders", "order", "dashboard", "payments", "invoices", "customers", "customer", "customer-orders"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!calc.ok) {
      setError(calc.error);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const paid = await createPayment({
        orderId: order.id,
        method: effectiveMethod,
        amountReceived: effectiveMethod === "CASH" ? received.trim() : undefined,
        idempotencyKey,
      });
      setResult(paid);
      refresh();
    } catch (err) {
      setError(getErrorMessage(err));
      const code = getErrorCode(err);
      if (code === "ALREADY_PAID" || code === "ORDER_CANCELLED" || code === "ORDER_CHANGED") refresh();
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- after the payment ----------
  if (result) {
    const change = decimalTextToPaise(result.changeGiven);
    return (
      <>
        <Modal title="Payment received" onClose={onDone} busy={showInvoice}>
          <div className="space-y-5 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-leo-100 text-leo-700">
              <CircleCheck className="h-9 w-9" />
            </span>
            <div>
              <p className="text-sm text-gray-600">Order {formatOrderNo(result.orderNo)}</p>
              <p className="text-3xl font-bold text-gray-900">{formatRupeesText(result.amount)}</p>
              <p className="mt-1 text-sm text-gray-600">
                {isFree ? "No payment was due" : METHOD_LABEL[result.method]}
                {result.invoiceNo ? ` · Invoice ${result.invoiceNo}` : ""}
              </p>
            </div>

            {result.method === "CASH" && result.amountReceived && (
              <div className="rounded-xl bg-leo-50 px-4 py-4">
                <p className="text-sm text-gray-600">
                  Received {formatRupeesText(result.amountReceived)}
                </p>
                <p className="text-sm font-medium text-gray-700">{change > 0 ? "Change to return" : "No change to return"}</p>
                {change > 0 && <p className="text-4xl font-bold text-leo-700">{formatRupees(change)}</p>}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              {result.invoiceId && (
                <Button variant="secondary" onClick={() => setShowInvoice(true)}>
                  <Printer className="h-5 w-5" />
                  Print / view invoice
                </Button>
              )}
              <Button onClick={onDone} autoFocus>
                Done
              </Button>
            </div>
          </div>
        </Modal>

        {showInvoice && result.invoiceId && (
          <InvoiceModal invoiceId={result.invoiceId} onClose={() => setShowInvoice(false)} />
        )}
      </>
    );
  }

  // ---------- taking the payment ----------
  const suggestions = cashSuggestions(totalPaise);
  const typed = received.trim() !== "";

  return (
    <Modal title="Take payment" onClose={onClose} busy={submitting}>
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-xl bg-gray-50 px-4 py-4 text-center">
          <p className="text-sm text-gray-600">Order {formatOrderNo(order.orderNo)}</p>
          <p className="text-4xl font-bold text-leo-700">{formatRupeesText(order.total)}</p>
        </div>

        {isFree ? (
          <Alert variant="info">
            Nothing is due on this order, because of a 100% discount. Confirm to complete it and create the invoice.
          </Alert>
        ) : (
          <>
            <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-4 gap-2">
              {METHODS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={method === value}
                  onClick={() => {
                    setMethod(value);
                    setError(null);
                  }}
                  className={[
                    "flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-medium transition-colors",
                    method === value
                      ? "bg-leo-600 text-white"
                      : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
                  ].join(" ")}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>

            {method === "CASH" ? (
              <div className="space-y-3">
                <TextField
                  label="Amount received (₹)"
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                  maxLength={10}
                  value={received}
                  onChange={(e) => {
                    setReceived(e.target.value);
                    setError(null);
                  }}
                />

                <div className="flex flex-wrap gap-2">
                  {suggestions.map((value, index) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setReceived(paiseToDecimalString(value));
                        setError(null);
                      }}
                      className="h-10 rounded-full border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-leo-50"
                    >
                      {index === 0 && value === totalPaise ? "Exact" : formatRupees(value)}
                    </button>
                  ))}
                </div>

                {typed && receivedPaise === null && (
                  <p className="text-sm text-red-600">Enter a valid amount, for example 500 or 500.50.</p>
                )}
                {receivedPaise !== null && receivedPaise < totalPaise && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    Short by {formatRupees(totalPaise - receivedPaise)}
                  </p>
                )}
                {receivedPaise !== null && receivedPaise >= totalPaise && (
                  <div className="rounded-xl bg-leo-50 px-4 py-3 text-center">
                    <p className="text-sm text-gray-600">Change to return</p>
                    <p className="text-3xl font-bold text-leo-700">{formatRupees(receivedPaise - totalPaise)}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
                Confirm only after the {METHOD_LABEL[method]} payment of {formatRupeesText(order.total)} has been
                received.
              </p>
            )}
          </>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!calc.ok}>
            {submitting ? "Saving payment..." : isFree ? "Complete order" : `Confirm payment · ${formatRupeesText(order.total)}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
