// ---------------------------------------------------------------------------
// Payment maths. All money is whole paise (150.50 rupees = 15050 paise).
//
// This exact file lives in BOTH backend/src/utils/paymentCalc.ts and
// frontend/src/utils/paymentCalc.ts. A backend test fails if the copies differ.
// The only import allowed is ./billing, which also exists in both places.
// ---------------------------------------------------------------------------
import { parseMoneyToPaise } from "./billing";

export type PaymentMethodName = "CASH" | "UPI" | "CARD" | "OTHER";

export type PaymentCalc =
  | { ok: true; receivedPaise: number | null; changePaise: number }
  | { ok: false; error: string };

// "531.00" -> 53100. For amounts the server already saved, so any size is accepted.
export function decimalTextToPaise(text: string): number {
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) throw new Error(`Not a valid amount: ${text}`);
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

// Cash needs the amount received, and gives back the change.
// Other methods always pay exactly the bill. A free order (total 0) needs nothing.
export function calculatePayment(
  method: PaymentMethodName,
  totalPaise: number,
  receivedText: string | undefined
): PaymentCalc {
  if (method !== "CASH" || totalPaise === 0) {
    return { ok: true, receivedPaise: null, changePaise: 0 };
  }

  const received = parseMoneyToPaise(receivedText ?? "");
  if (received === null) {
    return { ok: false, error: "Enter the amount received, for example 500 or 500.50." };
  }
  if (received < totalPaise) {
    return { ok: false, error: "The amount received is less than the bill." };
  }
  return { ok: true, receivedPaise: received, changePaise: received - totalPaise };
}
