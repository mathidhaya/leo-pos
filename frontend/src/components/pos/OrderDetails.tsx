import type { Dispatch } from "react";
import { Bike, ShoppingBag, Utensils, type LucideIcon } from "lucide-react";
import type { CartAction, CartState } from "../../hooks/usePosCart";
import type { OrderType } from "../../types/pos";
import type { DetailErrors } from "../../utils/posForm";
import TextAreaField from "../ui/TextAreaField";
import TextField from "../ui/TextField";

const TYPES: Array<{ value: OrderType; label: string; Icon: LucideIcon }> = [
  { value: "DINE_IN", label: "Dine In", Icon: Utensils },
  { value: "TAKE_AWAY", label: "Take Away", Icon: ShoppingBag },
  { value: "DELIVERY", label: "Delivery", Icon: Bike },
];

interface Props {
  cart: CartState;
  dispatch: Dispatch<CartAction>;
  errors: DetailErrors;
}

export default function OrderDetails({ cart, dispatch, errors }: Props) {
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Order type" className="grid grid-cols-3 gap-2">
        {TYPES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={cart.orderType === value}
            onClick={() => dispatch({ type: "setOrderType", orderType: value })}
            className={[
              "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-medium transition-colors",
              cart.orderType === value
                ? "bg-leo-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
            ].join(" ")}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>

      {cart.orderType === "DINE_IN" && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Table number"
            autoComplete="off"
            maxLength={20}
            value={cart.tableNo}
            onChange={(e) => dispatch({ type: "setText", field: "tableNo", value: e.target.value })}
          />
          <TextField
            label="People"
            inputMode="numeric"
            autoComplete="off"
            maxLength={2}
            value={cart.guests}
            error={errors.guests}
            onChange={(e) => dispatch({ type: "setText", field: "guests", value: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      )}

      {cart.orderType === "TAKE_AWAY" && (
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Customer (optional)"
            autoComplete="off"
            maxLength={80}
            value={cart.customerName}
            onChange={(e) => dispatch({ type: "setText", field: "customerName", value: e.target.value })}
          />
          <TextField
            label="Phone (optional)"
            inputMode="tel"
            autoComplete="off"
            maxLength={20}
            value={cart.customerPhone}
            error={errors.customerPhone}
            onChange={(e) => dispatch({ type: "setText", field: "customerPhone", value: e.target.value })}
          />
        </div>
      )}

      {cart.orderType === "DELIVERY" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Customer name"
              autoComplete="off"
              maxLength={80}
              value={cart.customerName}
              error={errors.customerName}
              onChange={(e) => dispatch({ type: "setText", field: "customerName", value: e.target.value })}
            />
            <TextField
              label="Phone"
              inputMode="tel"
              autoComplete="off"
              maxLength={20}
              value={cart.customerPhone}
              error={errors.customerPhone}
              onChange={(e) => dispatch({ type: "setText", field: "customerPhone", value: e.target.value })}
            />
          </div>
          <TextAreaField
            label="Delivery address"
            maxLength={300}
            rows={2}
            value={cart.address}
            error={errors.address}
            onChange={(e) => dispatch({ type: "setText", field: "address", value: e.target.value })}
          />
          <TextField
            label="Delivery charge (₹)"
            inputMode="decimal"
            autoComplete="off"
            maxLength={10}
            value={cart.deliveryCharge}
            error={errors.deliveryCharge}
            onChange={(e) => dispatch({ type: "setText", field: "deliveryCharge", value: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
