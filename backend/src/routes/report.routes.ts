import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as controller from "../controllers/report.controller";
import { authenticate, requireRole } from "../middleware/auth";

export const reportRouter = Router();

// Reports are for the Owner and Managers
reportRouter.use(authenticate, requireRole("OWNER", "MANAGER"));

// Making a PDF takes effort, so exports are limited
const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many exports. Please wait a minute and try again." },
  },
});

reportRouter.get("/sales", controller.sales);
reportRouter.get("/profit", controller.profit);
reportRouter.get("/products", controller.products);
reportRouter.get("/categories", controller.categories);
reportRouter.get("/payments", controller.payments);
reportRouter.get("/export", exportLimiter, controller.exportReport);
