import { isAxiosError } from "axios";
import type {
  CategoriesReport,
  GroupBy,
  PaymentsReport,
  ProductsReport,
  ProfitReport,
  ReportFormat,
  ReportKind,
  SalesReport,
} from "../types/reports";
import { api } from "./client";

interface Envelope<T> {
  success: boolean;
  data: T;
}

export interface RangeParams {
  from: string;
  to: string;
}

export interface TrendParams extends RangeParams {
  groupBy: GroupBy;
}

export async function fetchSales(params: TrendParams): Promise<SalesReport> {
  const res = await api.get<Envelope<SalesReport>>("/reports/sales", { params });
  return res.data.data;
}

export async function fetchProfit(params: TrendParams): Promise<ProfitReport> {
  const res = await api.get<Envelope<ProfitReport>>("/reports/profit", { params });
  return res.data.data;
}

export async function fetchProducts(params: RangeParams): Promise<ProductsReport> {
  const res = await api.get<Envelope<ProductsReport>>("/reports/products", { params });
  return res.data.data;
}

export async function fetchCategories(params: RangeParams): Promise<CategoriesReport> {
  const res = await api.get<Envelope<CategoriesReport>>("/reports/categories", { params });
  return res.data.data;
}

export async function fetchPayments(params: RangeParams): Promise<PaymentsReport> {
  const res = await api.get<Envelope<PaymentsReport>>("/reports/payments", { params });
  return res.data.data;
}

// A friendly message for a failed download. (A file request returns its error as a Blob,
// so the message has to be read out of it.)
export class ReportDownloadError extends Error {}

export async function downloadReport(params: {
  report: ReportKind;
  format: ReportFormat;
  from: string;
  to: string;
  groupBy: GroupBy;
}): Promise<Blob> {
  try {
    const res = await api.get<Blob>("/reports/export", { params, responseType: "blob" });
    return res.data;
  } catch (err) {
    if (isAxiosError(err) && err.response?.data instanceof Blob) {
      try {
        const body: unknown = JSON.parse(await err.response.data.text());
        const error = (body as { error?: { message?: string; details?: Array<{ message?: string }> } }).error;
        const message = error?.details?.[0]?.message ?? error?.message;
        if (typeof message === "string") throw new ReportDownloadError(message);
      } catch (inner) {
        if (inner instanceof ReportDownloadError) throw inner;
      }
    }
    throw err;
  }
}
