import { useEffect, useReducer, type Dispatch } from "react";
import type { OrderType } from "../types/pos";
import { MAX_LINES, MAX_QUANTITY } from "../utils/billing";
import { DRAFT_PREFIX } from "../utils/posDraft";

// The cart stores only WHAT was chosen (product + quantity). Prices always come from the live menu,
// so a cart can never hold an out-of-date price.

export interface CartItem {
  productId: string;
  quantity: number;
}

export type DiscountKind = "percent" | "amount";

export interface CartState {
  items: CartItem[];
  discountKind: DiscountKind;
  discountValue: string;
  orderType: OrderType;
  tableNo: string;
  guests: string;
  customerName: string;
  customerPhone: string;
  address: string;
  deliveryCharge: string;
}

export type TextField =
  | "discountValue"
  | "tableNo"
  | "guests"
  | "customerName"
  | "customerPhone"
  | "address"
  | "deliveryCharge";

export type CartAction =
  | { type: "add"; productId: string; limit: number }
  | { type: "setQuantity"; productId: string; quantity: number; limit: number }
  | { type: "remove"; productId: string }
  | { type: "sync"; limits: Record<string, number> }
  | { type: "setText"; field: TextField; value: string }
  | { type: "setOrderType"; orderType: OrderType }
  | { type: "setDiscountKind"; kind: DiscountKind }
  | { type: "clear" };

export const emptyCart: CartState = {
  items: [],
  discountKind: "percent",
  discountValue: "",
  orderType: "DINE_IN",
  tableNo: "",
  guests: "",
  customerName: "",
  customerPhone: "",
  address: "",
  deliveryCharge: "",
};

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      if (action.limit < 1) return state;
      const existing = state.items.find((item) => item.productId === action.productId);
      if (existing) {
        const next = Math.min(existing.quantity + 1, action.limit, MAX_QUANTITY);
        if (next === existing.quantity) return state;
        return {
          ...state,
          items: state.items.map((item) => (item.productId === action.productId ? { ...item, quantity: next } : item)),
        };
      }
      if (state.items.length >= MAX_LINES) return state;
      return { ...state, items: [...state.items, { productId: action.productId, quantity: 1 }] };
    }

    case "setQuantity": {
      const existing = state.items.find((item) => item.productId === action.productId);
      if (!existing || action.limit < 1) return state;
      const next = Math.min(Math.max(1, Math.floor(action.quantity)), action.limit, MAX_QUANTITY);
      if (next === existing.quantity) return state;
      return {
        ...state,
        items: state.items.map((item) => (item.productId === action.productId ? { ...item, quantity: next } : item)),
      };
    }

    case "remove":
      return { ...state, items: state.items.filter((item) => item.productId !== action.productId) };

    // After the menu or stock changes: drop items that are gone and lower quantities that are too high
    case "sync": {
      let changed = false;
      const items: CartItem[] = [];
      for (const item of state.items) {
        const limit = action.limits[item.productId] ?? 0;
        if (limit < 1) {
          changed = true;
          continue;
        }
        const quantity = Math.min(item.quantity, limit, MAX_QUANTITY);
        if (quantity !== item.quantity) changed = true;
        items.push({ ...item, quantity });
      }
      return changed ? { ...state, items } : state;
    }

    case "setText":
      return { ...state, [action.field]: action.value } as CartState;

    case "setOrderType":
      return { ...state, orderType: action.orderType };

    case "setDiscountKind":
      return { ...state, discountKind: action.kind };

    case "clear":
      return emptyCart;
  }
}

// ---------- remembering the unfinished order in this tab ----------

const ORDER_TYPES: OrderType[] = ["DINE_IN", "TAKE_AWAY", "DELIVERY"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const text = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

// Anything stored is treated as untrusted and checked before use
function loadDraft(userId: string): CartState {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + userId);
    if (!raw) return emptyCart;

    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || !Array.isArray(data.items)) return emptyCart;

    const seen = new Set<string>();
    const items: CartItem[] = [];
    for (const entry of data.items) {
      if (!isRecord(entry)) continue;
      const { productId, quantity } = entry;
      if (typeof productId !== "string" || productId.length > 64 || seen.has(productId)) continue;
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) continue;
      seen.add(productId);
      items.push({ productId, quantity });
      if (items.length >= MAX_LINES) break;
    }

    return {
      items,
      discountKind: data.discountKind === "amount" ? "amount" : "percent",
      discountValue: text(data.discountValue, 12),
      orderType: ORDER_TYPES.find((type) => type === data.orderType) ?? "DINE_IN",
      tableNo: text(data.tableNo, 20),
      guests: text(data.guests, 3),
      customerName: text(data.customerName, 80),
      customerPhone: text(data.customerPhone, 20),
      address: text(data.address, 300),
      deliveryCharge: text(data.deliveryCharge, 12),
    };
  } catch {
    return emptyCart;
  }
}

export function usePosCart(userId: string): [CartState, Dispatch<CartAction>] {
  const [state, dispatch] = useReducer(reducer, userId, loadDraft);

  useEffect(() => {
    try {
      const key = DRAFT_PREFIX + userId;
      if (state === emptyCart) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      // storage is not available: the order simply is not remembered
    }
  }, [state, userId]);

  return [state, dispatch];
}
