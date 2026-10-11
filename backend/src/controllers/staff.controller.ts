import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as staffService from "../services/staff.service";
import { idParamSchema } from "../validators/catalog.validators";
import { listStaffQuerySchema } from "../validators/staff.validators";

// A response that carries a temporary password must never be stored by the browser or a proxy
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

export const secretResponse = noStore;

export const list: RequestHandler = async (req, res) => {
  const query = listStaffQuerySchema.parse(req.query);
  res.json({ success: true, data: await staffService.listStaff(req.user!, query) });
};

export const create: RequestHandler = async (req, res) => {
  const data = await staffService.createStaff(req.user!, req.body, getRequestContext(req));
  res.status(201).json({ success: true, data });
};

export const update: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await staffService.updateStaff(req.user!, id, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const setStatus: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await staffService.setStaffStatus(req.user!, id, req.body.isActive, getRequestContext(req));
  res.json({ success: true, data });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const data = await staffService.resetStaffPassword(req.user!, id, getRequestContext(req));
  res.json({ success: true, data });
};

export const remove: RequestHandler = async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  await staffService.deleteStaff(req.user!, id, getRequestContext(req));
  res.json({ success: true, data: { message: "Staff member deleted." } });
};
