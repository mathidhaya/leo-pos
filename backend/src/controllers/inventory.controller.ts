import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as inventoryService from "../services/inventory.service";
import { listInventoryQuerySchema, listMovementsQuerySchema } from "../validators/inventory.validators";

export const list: RequestHandler = async (req, res) => {
  const query = listInventoryQuerySchema.parse(req.query);
  const data = await inventoryService.listInventory(req.user!, query);
  res.json({ success: true, data });
};

export const history: RequestHandler = async (req, res) => {
  const query = listMovementsQuerySchema.parse(req.query);
  const data = await inventoryService.listMovements(req.user!, query);
  res.json({ success: true, data });
};

export const adjust: RequestHandler = async (req, res) => {
  const { item, duplicate } = await inventoryService.adjustStock(req.user!, req.body, getRequestContext(req));
  // 201 = a new change was saved. 200 = the same request had already been saved.
  res.status(duplicate ? 200 : 201).json({ success: true, data: item });
};
