import type { Role } from "./auth";

export interface ShopSettings {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstNumber: string | null;
  logoUrl: string | null;
}

export interface BillingSettings {
  invoicePrefix: string;
  defaultGst: string;
  defaultDiscount: string;
  currency: string;
  nextInvoiceNumber: number; // read-only
  nextOrderNumber: number; // read-only
}

export interface ReceiptSettings {
  receiptFooter: string;
  printerName: string | null;
  showGst: boolean;
  showCashier: boolean;
}

// What the owner can edit
export interface SettingsData {
  shop: ShopSettings;
  billing: BillingSettings;
  receipt: ReceiptSettings;
}

// What every screen needs, for every role
export interface AppSettings {
  shopName: string;
  logoUrl: string | null;
  currency: string;
  defaultGst: string;
  defaultDiscount: string;
  printerName: string | null;
  userName: string;
}

export interface Account {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  lastLoginAt: string | null;
  joiningDate: string; // YYYY-MM-DD
  canChangeLogin: boolean; // only the owner
}
