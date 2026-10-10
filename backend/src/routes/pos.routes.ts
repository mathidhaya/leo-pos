import { Router } from "express";
import * as controller from "../controllers/pos.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { quoteSchema } from "../validators/pos.validators";

export const posRouter = Router();

// Taking orders is for the Owner and Cashiers
posRouter.use(authenticate, requireRole("OWNER", "CASHIER"));

posRouter.get("/catalog", controller.catalog);
posRouter.post("/quote", validateBody(quoteSchema), controller.quote);
