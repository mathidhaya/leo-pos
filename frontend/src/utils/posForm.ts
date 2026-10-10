import type { CartState, DiscountKind } from "../hooks/usePosCart";
import {
  MAX_DELIVERY_CHARGE_PAISE,
  parseMoneyToPaise,
  parsePercentToBasisPoints,
  type DiscountInput,
} from "./billing";
import { isValidPhone } from "./phone";

export type DetailField = "guests" | "customerName" | "customerPhone" | "address" | "deliveryCharge";
export type DetailErrors = Partial<Record<DetailField, string>>;

// Turns what was typed in the discount box into something the billing engine understands
export function readDiscount(kind: DiscountKind, text: string): { input: DiscountInput; error: string | null } {
  const value = text.trim();
  if (!value) return { input: { type: "none" }, error: null };

  if (kind === "percent") {
    const basisPoints = parsePercentToBasisPoints(value);
    return basisPoints === null
      ? { input: { type: "none" }, error: "Enter a percentage from 0 to 100." }
      : { input: { type: "percent", basisPoints }, error: null };
  }

  const paise = parseMoneyToPaise(value);
  return paise === null
    ? { input: { type: "none" }, error: "Enter a valid amount, for example 50 or 50.50." }
    : { input: { type: "amount", paise }, error: null };
}

export function readDelivery(text: string): { paise: number; error: string | null } {
  const value = text.trim();
  if (!value) return { paise: 0, error: null };

  const paise = parseMoneyToPaise(value);
  if (paise === null || paise > MAX_DELIVERY_CHARGE_PAISE) {
    return { paise: 0, error: "Enter a valid delivery charge (up to ₹10,000)." };
  }
  return { paise, error: null };
}

export function validateDetails(cart: CartState, deliveryError: string | null): DetailErrors {
  const errors: DetailErrors = {};
  const phone = cart.customerPhone.trim();

  if (cart.orderType === "DINE_IN") {
    const guests = cart.guests.trim();
    if (guests && !(/^\d{1,2}$/.test(guests) && Number(guests) >= 1)) {
      errors.guests = "Enter the number of people (1 to 99).";
    }
  }

  if (cart.orderType === "TAKE_AWAY" && phone && !isValidPhone(phone)) {
    errors.customerPhone = "Enter a valid 10-digit mobile number.";
  }

  if (cart.orderType === "DELIVERY") {
    if (cart.customerName.trim().length < 2) errors.customerName = "Enter the customer's name.";
    if (!phone) errors.customerPhone = "Enter the customer's mobile number.";
    else if (!isValidPhone(phone)) errors.customerPhone = "Enter a valid 10-digit mobile number.";
    if (cart.address.trim().length < 5) errors.address = "Enter the delivery address.";
    if (deliveryError) errors.deliveryCharge = deliveryError;
  }

  return errors;
}

// A short summary of the order details, for the verified summary screen
export function describeOrder(cart: CartState): string[] {
  const name = cart.customerName.trim();
  const phone = cart.customerPhone.trim();

  if (cart.orderType === "DINE_IN") {
    const table = cart.tableNo.trim();
    const guests = cart.guests.trim();
    return [
      table ? `Dine in, table ${table}` : "Dine in",
      ...(guests ? [`${guests} ${guests === "1" ? "person" : "people"}`] : []),
    ];
  }

  if (cart.orderType === "TAKE_AWAY") {
    return ["Take away", ...[name, phone].filter(Boolean)];
  }

  return ["Delivery", ...[name, phone, cart.address.trim()].filter(Boolean)];
}
