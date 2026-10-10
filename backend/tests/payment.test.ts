import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { calculatePayment, decimalTextToPaise } from "../src/utils/paymentCalc";

describe("calculatePayment", () => {
  it("gives the change for cash (the example from the spec: 450 paid with 500)", () => {
    expect(calculatePayment("CASH", 45000, "500")).toEqual({ ok: true, receivedPaise: 50000, changePaise: 5000 });
  });

  it("gives no change for an exact amount", () => {
    expect(calculatePayment("CASH", 28350, "283.50")).toEqual({ ok: true, receivedPaise: 28350, changePaise: 0 });
  });

  it("handles paise correctly", () => {
    expect(calculatePayment("CASH", 28350, "300")).toEqual({ ok: true, receivedPaise: 30000, changePaise: 1650 });
  });

  it("rejects cash that does not cover the bill", () => {
    expect(calculatePayment("CASH", 45000, "449.99")).toEqual({
      ok: false,
      error: "The amount received is less than the bill.",
    });
  });

  it("rejects a missing or invalid cash amount", () => {
    for (const bad of [undefined, "", "abc", "-5", "1.234", "1,000"]) {
      expect(calculatePayment("CASH", 45000, bad).ok).toBe(false);
    }
  });

  it("ignores the received amount for UPI, card and other", () => {
    for (const method of ["UPI", "CARD", "OTHER"] as const) {
      expect(calculatePayment(method, 45000, "999")).toEqual({ ok: true, receivedPaise: null, changePaise: 0 });
    }
  });

  it("needs nothing for a free order", () => {
    expect(calculatePayment("CASH", 0, undefined)).toEqual({ ok: true, receivedPaise: null, changePaise: 0 });
  });
});

describe("decimalTextToPaise", () => {
  it("converts saved amounts", () => {
    expect(decimalTextToPaise("531.00")).toBe(53100);
    expect(decimalTextToPaise("0.05")).toBe(5);
    expect(decimalTextToPaise("98999999901.00")).toBe(9_899_999_990_100);
  });

  it("refuses text that is not an amount", () => {
    expect(() => decimalTextToPaise("abc")).toThrow();
    expect(() => decimalTextToPaise("")).toThrow();
  });
});

describe("shared code", () => {
  it("the backend and frontend payment maths files are identical", () => {
    const read = (p: string) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
    const backend = read(path.resolve(process.cwd(), "src/utils/paymentCalc.ts"));
    const frontendPath = path.resolve(process.cwd(), "../frontend/src/utils/paymentCalc.ts");

    expect(fs.existsSync(frontendPath), "frontend/src/utils/paymentCalc.ts is missing").toBe(true);
    expect(read(frontendPath)).toBe(backend);
  });
});
