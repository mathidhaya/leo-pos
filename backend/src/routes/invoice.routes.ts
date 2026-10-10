import { Router } from "express";
import * as controller from "../controllers/invoice.controller";
import { authenticate, requireRole } from "../middleware/auth";

export const invoiceRouter = Router();

invoiceRouter.use(authenticate, requireRole("OWNER", "CASHIER"));

invoiceRouter.get("/", controller.list);
invoiceRouter.get("/:id", controller.get);
invoiceRouter.get("/:id/pdf", controller.pdf);
