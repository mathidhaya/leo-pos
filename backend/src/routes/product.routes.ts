import { Router } from "express";
import * as controller from "../controllers/product.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import {
  availabilitySchema,
  createProductSchema,
  updateProductSchema,
} from "../validators/catalog.validators";

export const productRouter = Router();

productRouter.use(authenticate);

// Every logged-in role can read products (POS needs them). Cashiers never receive cost or profit.
productRouter.get("/", controller.list);
productRouter.get("/:id", controller.get);

// Only the Owner and Managers can change the menu
const managers = requireRole("OWNER", "MANAGER");
productRouter.post("/", managers, validateBody(createProductSchema), controller.create);
productRouter.put("/:id", managers, validateBody(updateProductSchema), controller.update);
productRouter.patch("/:id/availability", managers, validateBody(availabilitySchema), controller.setAvailability);
productRouter.delete("/:id", managers, controller.remove);
