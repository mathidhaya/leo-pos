import { Router } from "express";
import * as controller from "../controllers/payment.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createPaymentSchema } from "../validators/payment.validators";

export const paymentRouter = Router();

// Taking money is for the Owner and Cashiers
paymentRouter.use(authenticate, requireRole("OWNER", "CASHIER"));

paymentRouter.get("/", controller.list);
paymentRouter.post("/", validateBody(createPaymentSchema), controller.create);
