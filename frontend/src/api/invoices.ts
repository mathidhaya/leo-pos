import type { Invoice, InvoiceList } from "../types/payments";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface InvoiceListParams {
  q?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listInvoices(params: InvoiceListParams): Promise<InvoiceList> {
  const res = await api.get<Envelope<InvoiceList>>("/invoices", { params });
  return res.data.data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const res = await api.get<Envelope<Invoice>>(`/invoices/${id}`);
  return res.data.data;
}

export async function downloadInvoicePdf(id: string): Promise<Blob> {
  const res = await api.get<Blob>(`/invoices/${id}/pdf`, { responseType: "blob" });
  return res.data;
}
