import type { OrderType, PaymentMethod } from "./orders";

export type { PaymentMethod };

export interface PaymentResult {
  paymentId: string;
  orderId: string;
  orderNo: number;
  method: PaymentMethod;
  amount: string;
  amountReceived: string | null;
  changeGiven: string;
  invoiceId: string | null;
  invoiceNo: string | null;
}

export interface PaymentRow {
  id: string;
  createdAt: string;
  orderId: string;
  orderNo: number;
  customerName: string | null;
  method: PaymentMethod;
  amount: string;
  amountReceived: string | null;
  changeGiven: string;
  cashier: string;
  refundedAt: string | null;
  invoiceId: string | null;
  invoiceNo: string | null;
}

export interface PaymentList {
  items: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: {
    byMethod: Array<{ method: PaymentMethod; count: number; total: string }>;
    collected: string;
    refunded: { count: number; total: string };
  };
}

export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: string;
  amount: string;
  gstPercent: string;
  discount: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  voided: boolean;
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
    orderType: OrderType;
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
    method: PaymentMethod;
    amount: string;
    amountReceived: string | null;
    changeGiven: string;
  } | null;
}

export interface InvoiceRow {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  orderNo: number;
  customerName: string | null;
  total: string;
  paymentMethod: PaymentMethod | null;
  voided: boolean;
}

export interface InvoiceList {
  items: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
