import type { RequestHandler } from "express";
import * as invoiceService from "../services/invoice.service";
import { renderReceiptPdf } from "../utils/receiptPdf";
import { idParamSchema } from "../validators/catalog.validators";
import { listInvoicesQuerySchema } from "../validators/payment.validators";

export const list: RequestHandler = async (req, res) => {
  const query = listInvoicesQuerySchema.parse(req.query);
  const data = await invoiceService.listInvoices(req.user!, query);
  res.json({ success: true, data });
};

export const get: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await invoiceService.getInvoice(req.user!, id);
  res.json({ success: true, data });
};

export const pdf: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const invoice = await invoiceService.getInvoice(req.user!, id);
  const buffer = await renderReceiptPdf(invoice);
  const filename = `${invoice.invoiceNo.replace(/[^A-Za-z0-9._-]/g, "_")}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buffer);
};
