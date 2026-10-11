import { Router } from "express";
import * as controller from "../controllers/customer.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { customerBodySchema } from "../validators/customer.validators";

export const customerRouter = Router();

// Owner, Manager and Cashier can look up, add and edit customers
customerRouter.use(authenticate);

customerRouter.get("/", controller.list);
customerRouter.get("/:id", controller.get);
customerRouter.get("/:id/orders", controller.orders);
customerRouter.post("/", validateBody(customerBodySchema), controller.create);
customerRouter.put("/:id", validateBody(customerBodySchema), controller.update);

// Only the Owner and Managers can delete
customerRouter.delete("/:id", requireRole("OWNER", "MANAGER"), controller.remove);
