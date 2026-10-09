import crypto from "crypto";
import { env } from "../config/env";

export function generateOtp(): string {
  return crypto.randomInt(0, 10000).toString().padStart(4, "0");
}

// The OTP is never stored in plain text. We store a keyed hash of it.
export function hashOtp(identifier: string, purpose: string, otp: string): string {
  return crypto
    .createHmac("sha256", env.JWT_REFRESH_SECRET)
    .update(`${identifier}:${purpose}:${otp}`)
    .digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
