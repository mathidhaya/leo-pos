import { Router } from "express";
import * as controller from "../controllers/settings.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { billingSchema, receiptSchema, shopSchema } from "../validators/settings.validators";

export const settingsRouter = Router();

settingsRouter.use(authenticate);

// Every role: the cafe's name and logo, and the defaults. Nothing sensitive.
settingsRouter.get("/app", controller.appSettings);

// Only the Owner reads and changes the cafe's settings
const owner = requireRole("OWNER");
settingsRouter.get("/", owner, controller.get);
settingsRouter.put("/shop", owner, validateBody(shopSchema), controller.updateShop);
settingsRouter.put("/billing", owner, validateBody(billingSchema), controller.updateBilling);
settingsRouter.put("/receipt", owner, validateBody(receiptSchema), controller.updateReceipt);
