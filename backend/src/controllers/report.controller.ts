import type { RequestHandler } from "express";
import { getRequestContext, logAudit } from "../services/audit.service";
import * as reportService from "../services/report.service";
import { buildReportDoc } from "../services/reportDocs.service";
import { renderCsv } from "../utils/tableDoc";
import { renderTablePdf } from "../utils/tablePdf";
import { exportQuerySchema, rangeQuerySchema, trendQuerySchema } from "../validators/report.validators";

export const sales: RequestHandler = async (req, res) => {
  const query = trendQuerySchema.parse(req.query);
  res.json({ success: true, data: await reportService.getSalesReport(req.user!, query) });
};

export const profit: RequestHandler = async (req, res) => {
  const query = trendQuerySchema.parse(req.query);
  res.json({ success: true, data: await reportService.getProfitReport(req.user!, query) });
};

export const products: RequestHandler = async (req, res) => {
  const query = rangeQuerySchema.parse(req.query);
  res.json({ success: true, data: await reportService.getProductsReport(req.user!, query) });
};

export const categories: RequestHandler = async (req, res) => {
  const query = rangeQuerySchema.parse(req.query);
  res.json({ success: true, data: await reportService.getCategoriesReport(req.user!, query) });
};

export const payments: RequestHandler = async (req, res) => {
  const query = rangeQuerySchema.parse(req.query);
  res.json({ success: true, data: await reportService.getPaymentsReport(req.user!, query) });
};

// Only letters, digits and dashes end up in the file name
function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "report";
}

export const exportReport: RequestHandler = async (req, res) => {
  const query = exportQuerySchema.parse(req.query);
  const doc = await buildReportDoc(req.user!, query);

  const body = query.format === "csv" ? Buffer.from(renderCsv(doc), "utf8") : await renderTablePdf(doc);
  const filename = `${slug(doc.shop)}-${query.report}-report-${query.from}_to_${query.to}.${query.format}`;

  await logAudit(
    {
      shopId: req.user!.shopId,
      userId: req.user!.id,
      action: "REPORT_EXPORTED",
      entity: "report",
      details: { report: query.report, format: query.format, from: query.from, to: query.to },
    },
    getRequestContext(req)
  );

  res.setHeader("Content-Type", query.format === "csv" ? "text/csv; charset=utf-8" : "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(body);
};
