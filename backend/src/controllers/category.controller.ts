import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as categoryService from "../services/category.service";
import { deleteCategoryQuerySchema, idParamSchema } from "../validators/catalog.validators";

export const list: RequestHandler = async (req, res) => {
  const data = await categoryService.listCategories(req.user!.shopId);
  res.json({ success: true, data });
};

export const create: RequestHandler = async (req, res) => {
  const data = await categoryService.createCategory(req.user!, req.body, getRequestContext(req));
  res.status(201).json({ success: true, data });
};

export const update: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await categoryService.updateCategory(req.user!, id, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const remove: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const { reassignTo } = deleteCategoryQuerySchema.parse(req.query);
  const result = await categoryService.deleteCategory(req.user!, id, reassignTo, getRequestContext(req));
  res.json({ success: true, data: { message: "Category deleted.", ...result } });
};
