import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as customerService from "../services/customer.service";
import { idParamSchema } from "../validators/catalog.validators";
import { customerOrdersQuerySchema, listCustomersQuerySchema } from "../validators/customer.validators";

export const list: RequestHandler = async (req, res) => {
  const query = listCustomersQuerySchema.parse(req.query);
  const data = await customerService.listCustomers(req.user!, query);
  res.json({ success: true, data });
};

export const get: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await customerService.getCustomer(req.user!, id);
  res.json({ success: true, data });
};

export const orders: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const query = customerOrdersQuerySchema.parse(req.query);
  const data = await customerService.listCustomerOrders(req.user!, id, query);
  res.json({ success: true, data });
};

export const create: RequestHandler = async (req, res) => {
  const data = await customerService.createCustomer(req.user!, req.body, getRequestContext(req));
  res.status(201).json({ success: true, data });
};

export const update: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await customerService.updateCustomer(req.user!, id, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const remove: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const result = await customerService.deleteCustomer(req.user!, id, getRequestContext(req));
  res.json({ success: true, data: { message: "Customer deleted.", ...result } });
};
