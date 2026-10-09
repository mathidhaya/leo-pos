import { rateLimit } from "express-rate-limit";

const tooMany = {
  success: false,
  error: { code: "RATE_LIMITED", message: "Too many attempts. Please try again in a few minutes." },
};

// Login, register, verify, reset
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});

// Sending OTPs costs money (SMS), so this is stricter
export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooMany,
});
