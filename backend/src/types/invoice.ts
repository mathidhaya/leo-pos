export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: string;
  amount: string; // unit price x quantity, before discount and GST
  gstPercent: string;
  discount: string;
}

// Everything needed to draw a receipt, on screen or as a PDF
export interface InvoiceData {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  voided: boolean; // the order was cancelled and refunded
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    gstNumber: string | null;
  };
  settings: { footer: string; showGst: boolean; showCashier: boolean };
  order: {
    id: string;
    orderNo: number;
    orderType: "DINE_IN" | "TAKE_AWAY" | "DELIVERY";
    tableNo: string | null;
    guests: number | null;
    deliveryAddress: string | null;
  };
  customer: { name: string; phone: string | null } | null;
  cashier: string;
  items: InvoiceItem[];
  subtotal: string;
  discount: string;
  tax: string;
  deliveryCharge: string;
  grandTotal: string;
  payment: {
    method: "CASH" | "UPI" | "CARD" | "OTHER";
    amount: string;
    amountReceived: string | null;
    changeGiven: string;
  } | null;
}
