import type { AppSettings, SettingsData } from "../types/settings";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface ShopPayload {
  name: string;
  address: string;
  phone: string;
  email: string;
  gstNumber: string;
  logoUrl: string | null;
}

export interface BillingPayload {
  invoicePrefix: string;
  defaultGst: string;
  defaultDiscount: string;
}

export interface ReceiptPayload {
  receiptFooter: string;
  printerName: string;
  showGst: boolean;
  showCashier: boolean;
}

export async function fetchSettings(): Promise<SettingsData> {
  const res = await api.get<Envelope<SettingsData>>("/settings");
  return res.data.data;
}

export async function fetchAppSettings(): Promise<AppSettings> {
  const res = await api.get<Envelope<AppSettings>>("/settings/app");
  return res.data.data;
}

export async function updateShop(payload: ShopPayload): Promise<SettingsData> {
  const res = await api.put<Envelope<SettingsData>>("/settings/shop", payload);
  return res.data.data;
}

export async function updateBilling(payload: BillingPayload): Promise<SettingsData> {
  const res = await api.put<Envelope<SettingsData>>("/settings/billing", payload);
  return res.data.data;
}

export async function updateReceipt(payload: ReceiptPayload): Promise<SettingsData> {
  const res = await api.put<Envelope<SettingsData>>("/settings/receipt", payload);
  return res.data.data;
}
