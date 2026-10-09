import crypto from "crypto";
import type { Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { RoleName } from "../types/auth";
import { AppError } from "./AppError";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REFRESH_COOKIE = "leo_refresh";
const COOKIE_PATH = "/api/v1/auth";

export interface AccessClaims {
  sub: string;
  shopId: string;
  role: RoleName;
}

export function signAccessToken(user: { id: string; shopId: string; role: RoleName }): string {
  return jwt.sign({ shopId: user.shopId, role: user.role }, env.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || !decoded.sub) throw new Error("bad token");
    return {
      sub: decoded.sub,
      shopId: decoded.shopId as string,
      role: decoded.role as RoleName,
    };
  } catch {
    throw new AppError(401, "TOKEN_INVALID", "Your session has expired. Please log in again.");
  }
}

// Refresh tokens are random strings. Only their hash is stored in the database.
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: REFRESH_TTL_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
  });
}
