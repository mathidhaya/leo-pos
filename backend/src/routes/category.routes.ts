import { Router } from "express";
import * as controller from "../controllers/category.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { categoryBodySchema } from "../validators/catalog.validators";

export const categoryRouter = Router();

categoryRouter.use(authenticate);

categoryRouter.get("/", controller.list);

const managers = requireRole("OWNER", "MANAGER");
categoryRouter.post("/", managers, validateBody(categoryBodySchema), controller.create);
categoryRouter.put("/:id", managers, validateBody(categoryBodySchema), controller.update);
categoryRouter.delete("/:id", managers, controller.remove);
