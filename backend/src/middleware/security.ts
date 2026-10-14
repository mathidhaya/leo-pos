import type { Request, RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { parseIdentifier } from "../utils/identifier";

interface LimiterOptions {
  windowMs: number;
  limit: number;
  message: string;
  // Count only requests that failed (status 400 or higher). Used for logins.
  onlyFailures?: boolean;
  keyGenerator?: (req: Request) => string;
  // The limits are switched off while running automated tests, unless a test asks to check them
  enforceInTests?: boolean;
}

export function createLimiter(options: LimiterOptions) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.onlyFailures ?? false,
    skip: () => env.NODE_ENV === "test" && !options.enforceInTests,
    message: { success: false, error: { code: "RATE_LIMITED", message: options.message } },
    ...(options.keyGenerator ? { keyGenerator: options.keyGenerator } : {}),
  });
}

// ---------- one limit for the whole API ----------
// All the devices in a cafe usually share one public address, so this is generous (10 requests a second).
export const apiLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 600,
  message: "Too many requests. Please slow down and try again in a minute.",
});

// ---------- logins, counted per account ----------
// The same account is recognised however it is typed: "9876543210", "+91 98765-43210", "Owner@X.com" ...
export function loginAttemptKey(body: unknown): string {
  const raw = typeof body === "object" && body !== null ? (body as { identifier?: unknown }).identifier : undefined;
  if (typeof raw !== "string") return "login:invalid";

  const parsed = parseIdentifier(raw);
  return `login:${parsed ? `${parsed.type}:${parsed.value}` : raw.trim().toLowerCase().slice(0, 100)}`;
}

// 10 failed logins for one account in 15 minutes locks that account's login for the rest of the window.
// This stops spread-out guessing. The trade-off: someone could lock an owner out for 15 minutes on purpose.
export const loginAccountLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  onlyFailures: true,
  keyGenerator: (req) => loginAttemptKey(req.body),
  message: "Too many failed logins for this account. Please try again in 15 minutes, or use Forgot password.",
});

// ---------- responses that must never be stored by the browser ----------
// Sales, profit and customers could otherwise be saved on a shared cafe computer
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

// ---------- cookie-based requests must come from our own website ----------
// A request with no Origin header (curl, a server) is allowed. A browser always sends one.
export function isAllowedOrigin(origin: string | undefined, allowed: string): boolean {
  return origin === undefined || origin === allowed;
}

// Used on refresh and logout, which rely on a cookie. (The cookie is also SameSite=Lax.)
// In development this is not enforced, so opening the app as 127.0.0.1 instead of localhost still works.
export const requireSameOrigin: RequestHandler = (req, _res, next) => {
  if (env.NODE_ENV === "production" && !isAllowedOrigin(req.get("origin"), env.CORS_ORIGIN)) {
    throw new AppError(403, "BAD_ORIGIN", "This request was blocked for your safety.");
  }
  next();
};
