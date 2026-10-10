import type { RequestHandler } from "express";
import * as dashboardService from "../services/dashboard.service";
import { dashboardQuerySchema } from "../validators/dashboard.validators";

export const getDashboard: RequestHandler = async (req, res) => {
  const query = dashboardQuerySchema.parse(req.query);
  const data = await dashboardService.getDashboard(req.user!, query);
  res.json({ success: true, data });
};
