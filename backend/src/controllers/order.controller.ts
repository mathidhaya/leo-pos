import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as orderService from "../services/order.service";
import { idParamSchema } from "../validators/catalog.validators";
import { listOrdersQuerySchema } from "../validators/order.validators";

export const list: RequestHandler = async (req, res) => {
  const query = listOrdersQuerySchema.parse(req.query);
  const data = await orderService.listOrders(req.user!, query);
  res.json({ success: true, data });
};

export const get: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await orderService.getOrder(req.user!, id);
  res.json({ success: true, data });
};

export const create: RequestHandler = async (req, res) => {
  const { order, duplicate } = await orderService.createOrder(req.user!, req.body, getRequestContext(req));
  // 201 = a new order was saved. 200 = the same request had already been saved.
  res.status(duplicate ? 200 : 201).json({ success: true, data: order });
};

export const updateStatus: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await orderService.updateStatus(req.user!, id, req.body.status, getRequestContext(req));
  res.json({ success: true, data });
};
