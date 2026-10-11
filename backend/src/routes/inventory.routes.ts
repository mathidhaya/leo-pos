import { Router } from "express";
import * as controller from "../controllers/inventory.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { adjustSchema } from "../validators/inventory.validators";

export const inventoryRouter = Router();

// Inventory is for the Owner and Managers
inventoryRouter.use(authenticate, requireRole("OWNER", "MANAGER"));

inventoryRouter.get("/", controller.list);
inventoryRouter.get("/history", controller.history);
inventoryRouter.post("/adjust", validateBody(adjustSchema), controller.adjust);
