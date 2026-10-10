// ---------------------------------------------------------------------------
// Billing engine
//
// All money is whole paise (integers): 150.50 rupees = 15050 paise.
// Percentages are basis points: 5% = 500, 12.5% = 1250.
//
// This exact file lives in BOTH backend/src/utils/billing.ts and
// frontend/src/utils/billing.ts. A backend test fails if the copies differ.
// Do not add imports to this file.
// ---------------------------------------------------------------------------

export const MAX_LINES = 60;
export const MAX_QUANTITY = 99;
export const MAX_UNIT_PRICE_PAISE = 999_999_999;
export const MAX_DELIVERY_CHARGE_PAISE = 1_000_000; // 10,000 rupees

export type DiscountInput =
  | { type: "none" }
  | { type: "percent"; basisPoints: number }
  | { type: "amount"; paise: number };

export interface BillLineInput {
  key: string;
  unitPricePaise: number;
  quantity: number;
  gstBasisPoints: number;
}

export interface BillInput {
  lines: BillLineInput[];
  discount: DiscountInput;
  deliveryChargePaise: number;
}

export interface BillLine {
  key: string;
  grossPaise: number; // unit price x quantity
  discountPaise: number; // this line's share of the bill discount
  taxablePaise: number; // gross - discount
  taxPaise: number; // GST on the taxable amount
  totalPaise: number; // taxable + tax
}

export interface Bill {
  lines: BillLine[];
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  deliveryChargePaise: number;
  grandTotalPaise: number;
}

export type BillResult = { ok: true; bill: Bill } | { ok: false; error: string };

const fail = (error: string): BillResult => ({ ok: false, error });

// Rounds (a x b) / c to the nearest whole number, halves rounding up.
// BigInt is used so very large amounts never lose precision.
export function mulDivRound(a: number, b: number, c: number): number {
  const numerator = BigInt(a) * BigInt(b);
  const denominator = BigInt(c);
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

// Splits `total` across the weights in proportion, so the parts add up to exactly `total`.
// Whole paise are given out first, then the leftover paise go to the largest remainders.
function allocateProportionally(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (total === 0 || weightSum === 0) return weights.map(() => 0);

  const t = BigInt(total);
  const s = BigInt(weightSum);
  const shares = weights.map((weight, index) => {
    const exact = t * BigInt(weight);
    return { index, floor: exact / s, remainder: exact % s };
  });

  const result = shares.map((share) => Number(share.floor));
  let leftover = total - result.reduce((sum, v) => sum + v, 0);

  const byRemainder = [...shares].sort((x, y) => {
    if (x.remainder === y.remainder) return x.index - y.index;
    return x.remainder > y.remainder ? -1 : 1;
  });
  for (let i = 0; leftover > 0; i++, leftover--) {
    result[byRemainder[i].index] += 1;
  }
  return result;
}

export function calculateBill(input: BillInput): BillResult {
  const { lines, discount, deliveryChargePaise } = input;

  if (lines.length === 0) return fail("Add at least one item.");
  if (lines.length > MAX_LINES) return fail(`An order can have at most ${MAX_LINES} different items.`);

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      return fail(`Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
    }
    if (!Number.isInteger(line.unitPricePaise) || line.unitPricePaise < 0 || line.unitPricePaise > MAX_UNIT_PRICE_PAISE) {
      return fail("An item has an invalid price.");
    }
    if (!Number.isInteger(line.gstBasisPoints) || line.gstBasisPoints < 0 || line.gstBasisPoints > 10000) {
      return fail("An item has an invalid GST rate.");
    }
  }
  if (
    !Number.isInteger(deliveryChargePaise) ||
    deliveryChargePaise < 0 ||
    deliveryChargePaise > MAX_DELIVERY_CHARGE_PAISE
  ) {
    return fail("The delivery charge is invalid.");
  }

  const gross = lines.map((line) => line.unitPricePaise * line.quantity);
  const subtotalPaise = gross.reduce((sum, g) => sum + g, 0);

  let discountPaise = 0;
  if (discount.type === "percent") {
    if (!Number.isInteger(discount.basisPoints) || discount.basisPoints < 0 || discount.basisPoints > 10000) {
      return fail("Discount must be between 0% and 100%.");
    }
    discountPaise = mulDivRound(subtotalPaise, discount.basisPoints, 10000);
  } else if (discount.type === "amount") {
    if (!Number.isInteger(discount.paise) || discount.paise < 0) {
      return fail("The discount amount is invalid.");
    }
    if (discount.paise > subtotalPaise) {
      return fail("The discount cannot be more than the bill subtotal.");
    }
    discountPaise = discount.paise;
  }

  const shares = allocateProportionally(discountPaise, gross);

  const billLines: BillLine[] = lines.map((line, i) => {
    const taxablePaise = gross[i] - shares[i];
    const taxPaise = mulDivRound(taxablePaise, line.gstBasisPoints, 10000);
    return {
      key: line.key,
      grossPaise: gross[i],
      discountPaise: shares[i],
      taxablePaise,
      taxPaise,
      totalPaise: taxablePaise + taxPaise,
    };
  });

  const taxPaise = billLines.reduce((sum, line) => sum + line.taxPaise, 0);

  return {
    ok: true,
    bill: {
      lines: billLines,
      subtotalPaise,
      discountPaise,
      taxPaise,
      deliveryChargePaise,
      grandTotalPaise: subtotalPaise - discountPaise + taxPaise + deliveryChargePaise,
    },
  };
}

// ---------- text <-> paise helpers ----------

// "150" -> 15000, "150.5" -> 15050, "150.50" -> 15050. Returns null if it is not a valid amount.
export function parseMoneyToPaise(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

// "5" -> 500, "12.5" -> 1250, "100" -> 10000. Returns null if it is not 0 to 100 with up to 2 decimals.
export function parsePercentToBasisPoints(text: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const basisPoints = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return basisPoints <= 10000 ? basisPoints : null;
}

// 15050 -> "150.50"
export function paiseToDecimalString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
