import type { Dispatch } from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
import type { CartAction, CartState } from "../../hooks/usePosCart";
import type { PosProduct } from "../../types/pos";
import { MAX_QUANTITY, type Bill } from "../../utils/billing";
import type { DetailErrors } from "../../utils/posForm";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import TextField from "../ui/TextField";
import BillSummary from "./BillSummary";
import CartLine from "./CartLine";
import OrderDetails from "./OrderDetails";

interface Props {
  cart: CartState;
  dispatch: Dispatch<CartAction>;
  lines: Array<{ product: PosProduct; quantity: number }>;
  bill: Bill | null;
  discountError: string | null;
  detailErrors: DetailErrors;
  showDetailErrors: boolean;
  quoting: boolean;
  quoteError: string | null;
  compact?: boolean; // on phones the surrounding dialog already has a title
  onQuantity: (productId: string, quantity: number) => void;
  onProceed: () => void;
  onClear: () => void;
}

export default function CartPanel({
  cart,
  dispatch,
  lines,
  bill,
  discountError,
  detailErrors,
  showDetailErrors,
  quoting,
  quoteError,
  compact = false,
  onQuantity,
  onProceed,
  onClear,
}: Props) {
  const billLines = new Map((bill?.lines ?? []).map((line) => [line.key, line] as const));
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!compact && (
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <ShoppingCart className="h-5 w-5 text-leo-700" />
            Current order
            {itemCount > 0 && (
              <span className="rounded-full bg-leo-100 px-2 py-0.5 text-sm font-medium text-leo-700">{itemCount}</span>
            )}
          </h2>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <OrderDetails
          cart={cart}
          dispatch={dispatch}
          errors={showDetailErrors ? detailErrors : {}}
        />

        {lines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500">
            <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            No items yet. Tap a product to add it.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {lines.map(({ product, quantity }) => (
              <CartLine
                key={product.id}
                product={product}
                quantity={quantity}
                max={Math.min(product.stock.quantity, MAX_QUANTITY)}
                line={billLines.get(product.id)}
                onQuantity={(next) => onQuantity(product.id, next)}
                onRemove={() => dispatch({ type: "remove", productId: product.id })}
              />
            ))}
          </ul>
        )}

        {lines.length > 0 && (
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <TextField
                label="Discount"
                inputMode="decimal"
                autoComplete="off"
                maxLength={10}
                placeholder={cart.discountKind === "percent" ? "e.g. 10" : "e.g. 50"}
                value={cart.discountValue}
                error={discountError ?? undefined}
                onChange={(e) => dispatch({ type: "setText", field: "discountValue", value: e.target.value })}
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Discount type"
              className="mt-[1.625rem] flex h-12 shrink-0 overflow-hidden rounded-xl border border-gray-300"
            >
              {(["percent", "amount"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={cart.discountKind === kind}
                  aria-label={kind === "percent" ? "Percent" : "Rupees"}
                  onClick={() => dispatch({ type: "setDiscountKind", kind })}
                  className={[
                    "w-12 text-base font-semibold",
                    cart.discountKind === kind ? "bg-leo-600 text-white" : "bg-white text-gray-700 hover:bg-leo-50",
                  ].join(" ")}
                >
                  {kind === "percent" ? "%" : "₹"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-gray-200 px-4 py-4">
        <BillSummary bill={bill} showDelivery={cart.orderType === "DELIVERY"} />
        {quoteError && <Alert variant="error">{quoteError}</Alert>}
        <Button fullWidth loading={quoting} disabled={lines.length === 0} onClick={onProceed}>
          {quoting ? "Checking the order..." : "Proceed to Payment"}
        </Button>
        {compact && lines.length > 0 && (
          <button type="button" onClick={onClear} className="w-full text-center text-sm font-medium text-red-600 hover:underline">
            Clear order
          </button>
        )}
      </div>
    </div>
  );
}
