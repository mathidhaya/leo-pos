import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import * as controller from "../controllers/account.controller";
import { authenticate } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { accountProfileSchema, changePasswordSchema } from "../validators/settings.validators";

export const accountRouter = Router();

// Every role can manage their own account
accountRouter.use(authenticate);

// These two check a password, so wrong guesses are limited
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again in a few minutes." },
  },
});

accountRouter.get("/", controller.get);
accountRouter.put("/profile", passwordLimiter, validateBody(accountProfileSchema), controller.updateProfile);
accountRouter.post("/change-password", passwordLimiter, validateBody(changePasswordSchema), controller.changePassword);
