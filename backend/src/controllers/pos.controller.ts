import type { RequestHandler } from "express";
import * as posService from "../services/pos.service";

export const catalog: RequestHandler = async (req, res) => {
  const data = await posService.getCatalog(req.user!.shopId);
  res.json({ success: true, data });
};

export const quote: RequestHandler = async (req, res) => {
  const data = await posService.quoteOrder(req.user!, req.body);
  res.json({ success: true, data });
};
