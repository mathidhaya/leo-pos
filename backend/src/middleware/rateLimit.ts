import { createLimiter } from "./security";

// Login, register, verify, reset
export const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: "Too many attempts. Please try again in a few minutes.",
});

// Sending OTPs costs money (SMS), so this is stricter
export const otpLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "Too many attempts. Please try again in a few minutes.",
});
