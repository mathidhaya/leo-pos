import type { Quote } from "../../types/pos";
import { formatRupeesText } from "../../utils/money";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Modal from "../ui/Modal";

interface Props {
  quote: Quote;
  details: string[];
  warning: string | null;
  error: string | null;
  placing: boolean;
  onPlace: () => void;
  onClose: () => void;
}

export default function OrderSummaryModal({ quote, details, warning, error, placing, onPlace, onClose }: Props) {
  const hasDelivery = quote.orderType === "DELIVERY";

  return (
    <Modal title="Order summary" onClose={onClose} busy={placing}>
      <div className="space-y-4">
        {warning && <Alert variant="info">{warning}</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-700">
          {details.map((part, index) => (
            <p key={index} className={index === 0 ? "font-semibold text-gray-900" : ""}>
              {part}
            </p>
          ))}
        </div>

        <ul className="divide-y divide-gray-100">
          {quote.lines.map((line) => (
            <li key={line.productId} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">
                  {line.name} <span className="text-gray-500">x {line.quantity}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {formatRupeesText(line.unitPrice)} each &middot; GST {Number(line.gstPercent)}%
                  {Number(line.discount) > 0 && ` · discount -${formatRupeesText(line.discount)}`}
                </p>
              </div>
              <p className="shrink-0 font-semibold text-gray-900">{formatRupeesText(line.total)}</p>
            </li>
          ))}
        </ul>

        <dl className="space-y-1.5 border-t border-gray-200 pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-600">Subtotal</dt>
            <dd>{formatRupeesText(quote.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">Discount</dt>
            <dd className="text-leo-700">
              {Number(quote.discount) > 0 ? `-${formatRupeesText(quote.discount)}` : formatRupeesText(quote.discount)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-600">GST</dt>
            <dd>{formatRupeesText(quote.tax)}</dd>
          </div>
          {hasDelivery && (
            <div className="flex justify-between">
              <dt className="text-gray-600">Delivery charge</dt>
              <dd>{formatRupeesText(quote.deliveryCharge)}</dd>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
            <dt className="text-base font-semibold text-gray-900">Grand Total</dt>
            <dd className="text-2xl font-bold text-leo-700">{formatRupeesText(quote.grandTotal)}</dd>
          </div>
        </dl>

        <p className="rounded-xl border border-dashed border-gray-300 p-3 text-xs text-gray-600">
          Prices, GST and stock were checked by the server just now. The order is saved first, then you take payment.
          Cash change and the invoice are handled right after.
        </p>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={placing}>
            Back to order
          </Button>
          <Button onClick={onPlace} loading={placing}>
            {placing ? "Placing order..." : "Place order"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
