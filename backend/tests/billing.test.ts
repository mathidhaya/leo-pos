import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  calculateBill,
  mulDivRound,
  paiseToDecimalString,
  parseMoneyToPaise,
  parsePercentToBasisPoints,
  type BillInput,
} from "../src/utils/billing";

function bill(input: BillInput) {
  const result = calculateBill(input);
  if (!result.ok) throw new Error(`Expected a bill but got: ${result.error}`);
  return result.bill;
}

const line = (key: string, unitPricePaise: number, quantity: number, gstBasisPoints = 500) => ({
  key,
  unitPricePaise,
  quantity,
  gstBasisPoints,
});

describe("calculateBill", () => {
  it("matches the example from the project spec (500 - 50 + 81 = 531)", () => {
    const b = bill({
      lines: [line("a", 25000, 2, 1800)], // 2 x 250.00 at 18% GST
      discount: { type: "amount", paise: 5000 },
      deliveryChargePaise: 0,
    });
    expect(b.subtotalPaise).toBe(50000);
    expect(b.discountPaise).toBe(5000);
    expect(b.taxPaise).toBe(8100);
    expect(b.grandTotalPaise).toBe(53100);
  });

  it("gives the same result for 10% as for the equal rupee amount", () => {
    const input = { lines: [line("a", 25000, 2, 1800)], deliveryChargePaise: 0 };
    const percent = bill({ ...input, discount: { type: "percent", basisPoints: 1000 } });
    const amount = bill({ ...input, discount: { type: "amount", paise: 5000 } });
    expect(percent.grandTotalPaise).toBe(amount.grandTotalPaise);
  });

  it("calculates GST on the discounted price, per line", () => {
    const b = bill({
      lines: [line("a", 10000, 1, 500), line("b", 10000, 1, 1200)],
      discount: { type: "amount", paise: 2000 },
      deliveryChargePaise: 0,
    });
    expect(b.lines.map((l) => l.discountPaise)).toEqual([1000, 1000]);
    expect(b.lines.map((l) => l.taxPaise)).toEqual([450, 1080]); // 5% of 90.00, 12% of 90.00
    expect(b.taxPaise).toBe(1530);
  });

  it("rounds GST halves up (52.5 paise becomes 53)", () => {
    expect(mulDivRound(1050, 500, 10000)).toBe(53);
    const b = bill({ lines: [line("a", 1050, 1, 500)], discount: { type: "none" }, deliveryChargePaise: 0 });
    expect(b.taxPaise).toBe(53);
  });

  it("splits a discount so the parts add up exactly", () => {
    const b = bill({
      lines: [line("a", 10000, 1), line("b", 10000, 1), line("c", 10000, 1)],
      discount: { type: "amount", paise: 100 },
      deliveryChargePaise: 0,
    });
    const shares = b.lines.map((l) => l.discountPaise);
    expect(shares.reduce((a, c) => a + c, 0)).toBe(100);
    expect(shares).toEqual([34, 33, 33]);
  });

  it("never gives a line a bigger discount than its own value", () => {
    const b = bill({
      lines: [line("a", 1, 1), line("b", 100000, 1)],
      discount: { type: "percent", basisPoints: 10000 },
      deliveryChargePaise: 0,
    });
    for (const l of b.lines) expect(l.discountPaise).toBeLessThanOrEqual(l.grossPaise);
    expect(b.taxPaise).toBe(0);
    expect(b.grandTotalPaise).toBe(0);
  });

  it("adds the delivery charge without GST", () => {
    const b = bill({ lines: [line("a", 10000, 1, 500)], discount: { type: "none" }, deliveryChargePaise: 3000 });
    expect(b.taxPaise).toBe(500);
    expect(b.grandTotalPaise).toBe(10000 + 500 + 3000);
  });

  it("stays exact for very large amounts", () => {
    const b = bill({
      lines: [line("a", 999_999_999, 99, 1800)],
      discount: { type: "percent", basisPoints: 10000 },
      deliveryChargePaise: 500,
    });
    expect(b.subtotalPaise).toBe(98_999_999_901);
    expect(b.discountPaise).toBe(98_999_999_901);
    expect(b.grandTotalPaise).toBe(500);
  });

  it("keeps every total consistent for 500 random bills", () => {
    let seed = 12345;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const gstRates = [0, 500, 1200, 1800, 2800];

    for (let n = 0; n < 500; n++) {
      const lines = Array.from({ length: int(1, 6) }, (_, i) => line(`k${i}`, int(1, 500000), int(1, 20), gstRates[int(0, 4)]));
      const subtotal = lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
      const pick = int(0, 2);
      const discount =
        pick === 0
          ? ({ type: "none" } as const)
          : pick === 1
            ? ({ type: "percent", basisPoints: int(0, 10000) } as const)
            : ({ type: "amount", paise: int(0, subtotal) } as const);
      const deliveryChargePaise = int(0, 1) * int(0, 100000);

      const b = bill({ lines, discount, deliveryChargePaise });

      expect(b.lines.reduce((s, l) => s + l.discountPaise, 0)).toBe(b.discountPaise);
      expect(b.lines.reduce((s, l) => s + l.taxPaise, 0)).toBe(b.taxPaise);
      expect(b.lines.reduce((s, l) => s + l.totalPaise, 0)).toBe(b.grandTotalPaise - b.deliveryChargePaise);
      expect(b.grandTotalPaise).toBe(b.subtotalPaise - b.discountPaise + b.taxPaise + b.deliveryChargePaise);
      expect(b.discountPaise).toBeLessThanOrEqual(b.subtotalPaise);
    }
  });

  it("rejects invalid input with a clear message", () => {
    const base = { lines: [line("a", 10000, 1)], discount: { type: "none" } as const, deliveryChargePaise: 0 };

    expect(calculateBill({ ...base, lines: [] })).toEqual({ ok: false, error: "Add at least one item." });
    expect(calculateBill({ ...base, lines: [line("a", 10000, 0)] }).ok).toBe(false);
    expect(calculateBill({ ...base, lines: [line("a", 10000, 100)] }).ok).toBe(false);
    expect(calculateBill({ ...base, lines: [line("a", 10000, 1.5)] }).ok).toBe(false);
    expect(calculateBill({ ...base, lines: [line("a", -5, 1)] }).ok).toBe(false);
    expect(calculateBill({ ...base, lines: [line("a", 10000, 1, 10001)] }).ok).toBe(false);
    expect(calculateBill({ ...base, deliveryChargePaise: -1 }).ok).toBe(false);
    expect(calculateBill({ ...base, discount: { type: "percent", basisPoints: 10001 } }).ok).toBe(false);
    expect(calculateBill({ ...base, discount: { type: "amount", paise: -1 } }).ok).toBe(false);

    const tooMuch = calculateBill({ ...base, discount: { type: "amount", paise: 10001 } });
    expect(tooMuch).toEqual({ ok: false, error: "The discount cannot be more than the bill subtotal." });
  });
});

describe("text helpers", () => {
  it("parses money", () => {
    expect(parseMoneyToPaise("150")).toBe(15000);
    expect(parseMoneyToPaise("150.5")).toBe(15050);
    expect(parseMoneyToPaise("150.50")).toBe(15050);
    expect(parseMoneyToPaise(" 0.05 ")).toBe(5);
    for (const bad of ["", "abc", "-5", "1.234", "12345678", "1,000", ".5", "5."]) {
      expect(parseMoneyToPaise(bad)).toBeNull();
    }
  });

  it("parses percentages", () => {
    expect(parsePercentToBasisPoints("5")).toBe(500);
    expect(parsePercentToBasisPoints("12.5")).toBe(1250);
    expect(parsePercentToBasisPoints("100")).toBe(10000);
    expect(parsePercentToBasisPoints("100.01")).toBeNull();
    expect(parsePercentToBasisPoints("101")).toBeNull();
    expect(parsePercentToBasisPoints("-1")).toBeNull();
  });

  it("formats paise", () => {
    expect(paiseToDecimalString(15050)).toBe("150.50");
    expect(paiseToDecimalString(5)).toBe("0.05");
    expect(paiseToDecimalString(0)).toBe("0.00");
    expect(paiseToDecimalString(-250)).toBe("-2.50");
  });
});

describe("shared code", () => {
  it("the backend and frontend billing files are identical", () => {
    const read = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const backend = read(path.resolve(process.cwd(), "src/utils/billing.ts"));
    const frontendPath = path.resolve(process.cwd(), "../frontend/src/utils/billing.ts");

    expect(fs.existsSync(frontendPath), "frontend/src/utils/billing.ts is missing").toBe(true);
    expect(read(frontendPath)).toBe(backend);
  });
});
