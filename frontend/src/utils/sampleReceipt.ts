import type { Invoice } from "../types/payments";

interface Args {
  shop: { name: string; address: string | null; phone: string | null; email: string | null; gstNumber: string | null };
  invoiceNo: string;
  cashier: string;
  footer: string;
  showGst: boolean;
  showCashier: boolean;
}

// A made-up receipt (2 cappuccinos and a sandwich), used for the live preview and the test print.
// 2 x 150 + 120 = 420, GST 5% = 21, total 441, paid with 500 cash, change 59.
export function buildSampleInvoice(args: Args): Invoice {
  return {
    id: "sample",
    invoiceNo: args.invoiceNo,
    issuedAt: new Date().toISOString(),
    voided: false,
    shop: args.shop,
    settings: { footer: args.footer, showGst: args.showGst, showCashier: args.showCashier },
    order: { id: "sample", orderNo: 123, orderType: "DINE_IN", tableNo: "4", guests: 2, deliveryAddress: null },
    customer: null,
    cashier: args.cashier,
    items: [
      { name: "Cappuccino", quantity: 2, unitPrice: "150.00", amount: "300.00", gstPercent: "5.00", discount: "0.00" },
      { name: "Veg Sandwich", quantity: 1, unitPrice: "120.00", amount: "120.00", gstPercent: "5.00", discount: "0.00" },
    ],
    subtotal: "420.00",
    discount: "0.00",
    tax: "21.00",
    deliveryCharge: "0.00",
    grandTotal: "441.00",
    payment: { method: "CASH", amount: "441.00", amountReceived: "500.00", changeGiven: "59.00" },
  };
}
