import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as paymentService from "../services/payment.service";
import { listPaymentsQuerySchema } from "../validators/payment.validators";

export const create: RequestHandler = async (req, res) => {
  const { result, duplicate } = await paymentService.createPayment(req.user!, req.body, getRequestContext(req));
  // 201 = a new payment was saved. 200 = the same request had already been saved.
  res.status(duplicate ? 200 : 201).json({ success: true, data: result });
};

export const list: RequestHandler = async (req, res) => {
  const query = listPaymentsQuerySchema.parse(req.query);
  const data = await paymentService.listPayments(req.user!, query);
  res.json({ success: true, data });
};
