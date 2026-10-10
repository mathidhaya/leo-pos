import { Router } from "express";
import * as controller from "../controllers/order.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createOrderSchema, updateStatusSchema } from "../validators/order.validators";

export const orderRouter = Router();

orderRouter.use(authenticate);

// Owner, Manager and Cashier can see orders and move them along
orderRouter.get("/", controller.list);
orderRouter.get("/:id", controller.get);
orderRouter.patch("/:id/status", validateBody(updateStatusSchema), controller.updateStatus);

// Only the Owner and Cashiers take orders
orderRouter.post("/", requireRole("OWNER", "CASHIER"), validateBody(createOrderSchema), controller.create);
