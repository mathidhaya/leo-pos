import { describe, expect, it } from "vitest";
import type { InvoiceData } from "../src/types/invoice";
import { renderReceiptPdf } from "../src/utils/receiptPdf";

function sample(overrides: Partial<InvoiceData> = {}, itemCount = 2): InvoiceData {
  return {
    id: "inv-1",
    invoiceNo: "LC-000001",
    issuedAt: "2026-10-12T08:30:00.000Z",
    voided: false,
    shop: { name: "Leo Cafe", address: "12 Park Street", phone: "9999999999", email: null, gstNumber: "33ABCDE1234F1Z5" },
    settings: { footer: "Thank you for visiting Leo Cafe!", showGst: true, showCashier: true },
    order: { id: "o-1", orderNo: 42, orderType: "DINE_IN", tableNo: "T4", guests: 2, deliveryAddress: null },
    customer: null,
    cashier: "Test Cashier",
    items: Array.from({ length: itemCount }, (_, i) => ({
      name: i === 0 ? "Chocolate Brownie with a very long name" : `Item ${i}`,
      quantity: 2,
      unitPrice: "150.00",
      amount: "300.00",
      gstPercent: "5.00",
      discount: "0.00",
    })),
    subtotal: "600.00",
    discount: "60.00",
    tax: "27.00",
    deliveryCharge: "0.00",
    grandTotal: "567.00",
    payment: { method: "CASH", amount: "567.00", amountReceived: "600.00", changeGiven: "33.00" },
    ...overrides,
  };
}

describe("renderReceiptPdf", () => {
  it("creates a real PDF", async () => {
    const pdf = await renderReceiptPdf(sample());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("handles delivery, a cancelled invoice and a long order", async () => {
    const pdf = await renderReceiptPdf(
      sample(
        {
          voided: true,
          order: { id: "o-2", orderNo: 7, orderType: "DELIVERY", tableNo: null, guests: null, deliveryAddress: "12 Park Street, Chennai" },
          customer: { name: "Asha", phone: "9876543210" },
          deliveryCharge: "30.00",
          payment: { method: "UPI", amount: "597.00", amountReceived: null, changeGiven: "0.00" },
        },
        40
      )
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("handles an invoice without a payment record", async () => {
    const pdf = await renderReceiptPdf(sample({ payment: null }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
