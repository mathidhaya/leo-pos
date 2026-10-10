import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as productService from "../services/product.service";
import { idParamSchema, listProductsQuerySchema } from "../validators/catalog.validators";

export const list: RequestHandler = async (req, res) => {
  const query = listProductsQuerySchema.parse(req.query);
  const data = await productService.listProducts(req.user!, query);
  res.json({ success: true, data });
};

export const get: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await productService.getProduct(req.user!, id);
  res.json({ success: true, data });
};

export const create: RequestHandler = async (req, res) => {
  const data = await productService.createProduct(req.user!, req.body, getRequestContext(req));
  res.status(201).json({ success: true, data });
};

export const update: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await productService.updateProduct(req.user!, id, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const setAvailability: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await productService.setAvailability(
    req.user!,
    id,
    req.body.isAvailable,
    getRequestContext(req)
  );
  res.json({ success: true, data });
};

export const remove: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  await productService.deleteProduct(req.user!, id, getRequestContext(req));
  res.json({ success: true, data: { message: "Product deleted." } });
};
