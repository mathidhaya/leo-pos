import { Router } from "express";
import * as controller from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { authLimiter, otpLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
} from "../validators/auth.validators";

export const authRouter = Router();

authRouter.post("/send-otp", otpLimiter, validateBody(sendOtpSchema), controller.sendOtp);
authRouter.post("/verify-otp", authLimiter, validateBody(verifyOtpSchema), controller.verifyOtp);
authRouter.post("/register", authLimiter, validateBody(registerSchema), controller.register);
authRouter.post("/login", authLimiter, validateBody(loginSchema), controller.login);
authRouter.post("/refresh", authLimiter, controller.refresh);
authRouter.post("/logout", controller.logout);
authRouter.post("/forgot-password", otpLimiter, validateBody(forgotPasswordSchema), controller.forgotPassword);
authRouter.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
authRouter.get("/me", authenticate, controller.me);
