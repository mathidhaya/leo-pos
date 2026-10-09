import type { RequestHandler } from "express";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { verifyAccessToken } from "../utils/tokens";

// Who is calling? Reads the token, then re-checks the user in the database.
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");
  }

  const claims = verifyAccessToken(header.slice(7));
  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: { id: true, shopId: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");
  }

  req.user = { id: user.id, shopId: user.shopId, role: user.role };
  next();
};

// Is this person allowed? Use after authenticate:  requireRole("OWNER", "MANAGER")
export const requireRole =
  (...roles: RoleName[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", "You do not have permission to do this.");
    }
    next();
  };
