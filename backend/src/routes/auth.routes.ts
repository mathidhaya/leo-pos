import { Router } from "express";
import * as controller from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";
import { authLimiter, otpLimiter } from "../middleware/rateLimit";
import { loginAccountLimiter, requireSameOrigin } from "../middleware/security";
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
authRouter.post("/login", authLimiter, loginAccountLimiter, validateBody(loginSchema), controller.login);
// These two use the refresh cookie, so they also check that the request comes from our own website
authRouter.post("/refresh", authLimiter, requireSameOrigin, controller.refresh);
authRouter.post("/logout", requireSameOrigin, controller.logout);
authRouter.post("/forgot-password", otpLimiter, validateBody(forgotPasswordSchema), controller.forgotPassword);
authRouter.post("/reset-password", authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
authRouter.get("/me", authenticate, controller.me);
