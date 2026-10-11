import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as controller from "../controllers/staff.controller";
import { authenticate, requireRole } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { staffBodySchema, staffStatusSchema } from "../validators/staff.validators";

export const staffRouter = Router();

// Only the Owner manages staff
staffRouter.use(authenticate, requireRole("OWNER"));

// Creating accounts and resetting passwords hands out passwords, so these are limited
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again in a few minutes." },
  },
});

staffRouter.get("/", controller.list);
staffRouter.post("/", sensitiveLimiter, controller.secretResponse, validateBody(staffBodySchema), controller.create);
staffRouter.put("/:id", validateBody(staffBodySchema), controller.update);
staffRouter.patch("/:id/status", validateBody(staffStatusSchema), controller.setStatus);
staffRouter.post("/:id/reset-password", sensitiveLimiter, controller.secretResponse, controller.resetPassword);
staffRouter.delete("/:id", controller.remove);
