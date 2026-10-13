import type { RequestHandler } from "express";
import { getRequestContext } from "../services/audit.service";
import * as settingsService from "../services/settings.service";

export const get: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await settingsService.getSettings(req.user!) });
};

export const appSettings: RequestHandler = async (req, res) => {
  res.json({ success: true, data: await settingsService.getAppSettings(req.user!) });
};

export const updateShop: RequestHandler = async (req, res) => {
  const data = await settingsService.updateShop(req.user!, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const updateBilling: RequestHandler = async (req, res) => {
  const data = await settingsService.updateBilling(req.user!, req.body, getRequestContext(req));
  res.json({ success: true, data });
};

export const updateReceipt: RequestHandler = async (req, res) => {
  const data = await settingsService.updateReceipt(req.user!, req.body, getRequestContext(req));
  res.json({ success: true, data });
};
