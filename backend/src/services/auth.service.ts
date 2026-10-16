import { env } from "../config/env";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { parseIdentifier, type Identifier } from "../utils/identifier";
import { generateOtp, hashOtp, safeEqual } from "../utils/otp";
import { comparePassword, DUMMY_HASH, hashPassword } from "../utils/password";
import {
  REFRESH_TTL_MS,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "../utils/tokens";
import { logAudit, type RequestContext } from "./audit.service";
import { deliverOtp } from "./notification.service";

export type OtpPurposeName = "REGISTER" | "RESET";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const VERIFIED_TTL_MS = 15 * 60 * 1000;
const REFRESH_REUSE_GRACE_MS = 10 * 1000;
const DEFAULT_CATEGORIES = ["Coffee", "Tea", "Fast Food", "Beverages", "Snacks", "Desserts"];

// A 4-digit code has only 10,000 possibilities, so the number of tries is limited per phone number or
// email address in total, not per code. Asking for a new code never gives back the tries already used.
// At most 20 guesses a day means about a 0.2% chance of guessing right, per account per day.
export const OTP_MAX_SENDS_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS_PER_DAY = 20;
const OTP_HISTORY_KEEP_MS = 2 * DAY_MS;

// ---------- helpers ----------

function mustParse(raw: string): Identifier {
  const id = parseIdentifier(raw);
  if (!id) {
    throw new AppError(400, "INVALID_IDENTIFIER", "Please enter a valid mobile number or email.");
  }
  return id;
}

function assertRegistrationOpen(): void {
  if (!env.ALLOW_REGISTRATION) {
    throw new AppError(
      403,
      "REGISTRATION_CLOSED",
      "New cafe registration is closed on this server. Please ask the owner to add you as staff."
    );
  }
}

function findUserByIdentifier(id: Identifier) {
  return prisma.user.findFirst({
    where: id.type === "email" ? { email: id.value } : { phone: id.value },
    include: { shop: { select: { id: true, name: true } } },
  });
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

interface PublicUserInput {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: RoleName;
  shop: { id: string; name: string };
}

// Only these fields ever leave the server. Never the password hash.
function toPublicUser(user: PublicUserInput) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    shop: { id: user.shop.id, name: user.shop.name },
  };
}

async function createRefreshToken(userId: string, ctx: RequestContext): Promise<string> {
  const token = generateRefreshToken();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  return token;
}

// ---------- OTP ----------

export async function sendOtp(rawIdentifier: string, purpose: OtpPurposeName): Promise<void> {
  if (purpose === "REGISTER") assertRegistrationOpen();

  const id = mustParse(rawIdentifier);
  const user = await findUserByIdentifier(id);

  if (purpose === "REGISTER" && user) {
    throw new AppError(
      409,
      "ALREADY_REGISTERED",
      "This mobile number or email is already registered. Please log in."
    );
  }

  // For password reset we answer the same way whether the account exists or not.
  if (purpose === "RESET" && (!user || !user.isActive)) return;

  const now = Date.now();
  const [sentLastHour, recent] = await Promise.all([
    prisma.otpVerification.count({
      where: { identifier: id.value, purpose, createdAt: { gt: new Date(now - HOUR_MS) } },
    }),
    prisma.otpVerification.findFirst({
      where: { identifier: id.value, purpose, createdAt: { gt: new Date(now - OTP_RESEND_COOLDOWN_MS) } },
    }),
  ]);

  // Too many codes asked for. A registration is told. A password reset stays silent, so nobody
  // can find out which accounts exist.
  if (sentLastHour >= OTP_MAX_SENDS_PER_HOUR) {
    if (purpose === "RESET") return;
    throw new AppError(
      429,
      "OTP_RATE_LIMITED",
      "Too many OTP requests for this number or email. Please try again in an hour."
    );
  }

  if (recent) {
    if (purpose === "RESET") return;
    throw new AppError(429, "OTP_COOLDOWN", "Please wait 30 seconds before requesting another OTP.");
  }

  const otp = generateOtp();
  // Earlier codes are kept (not deleted), so the number of tries already used is remembered
  await prisma.otpVerification.create({
    data: {
      identifier: id.value,
      purpose,
      otpHash: hashOtp(id.value, purpose, otp),
      expiresAt: new Date(now + OTP_TTL_MS),
    },
  });

  // Housekeeping: records older than two days are removed
  await prisma.otpVerification.deleteMany({ where: { createdAt: { lt: new Date(now - OTP_HISTORY_KEEP_MS) } } });

  if (purpose === "RESET") {
    // Sent in the background, and a failure is only logged, so nobody can find out which accounts exist by timing or by errors.
    void (async () => {
      try {
        await deliverOtp(id, otp, purpose);
      } catch {
        console.error("OTP delivery failed for a password reset.");
      }
    })();
    return;
  }

  await deliverOtp(id, otp, purpose);
}

export async function verifyOtp(
  rawIdentifier: string,
  purpose: OtpPurposeName,
  otp: string
): Promise<{ verificationId: string }> {
  const id = mustParse(rawIdentifier);

  // The tries used in the last 24 hours, over all codes sent to this number or email
  const spent = await prisma.otpVerification.aggregate({
    where: { identifier: id.value, purpose, createdAt: { gt: new Date(Date.now() - DAY_MS) } },
    _sum: { attempts: true },
  });
  if ((spent._sum.attempts ?? 0) >= OTP_MAX_ATTEMPTS_PER_DAY) {
    throw new AppError(429, "OTP_LOCKED", "Too many wrong attempts. Please try again tomorrow.");
  }

  const row = await prisma.otpVerification.findFirst({
    where: { identifier: id.value, purpose, verifiedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new AppError(400, "INVALID_OTP", "Invalid OTP");
  if (row.expiresAt < new Date()) {
    throw new AppError(400, "OTP_EXPIRED", "OTP expired. Please request a new one.");
  }

  // Count the try first (atomically), so parallel guesses cannot exceed the limit.
  const { attempts } = await prisma.otpVerification.update({
    where: { id: row.id },
    data: { attempts: { increment: 1 } },
    select: { attempts: true },
  });
  if (attempts > OTP_MAX_ATTEMPTS) {
    throw new AppError(429, "OTP_LOCKED", "Too many wrong attempts. Please request a new OTP.");
  }

  if (!safeEqual(row.otpHash, hashOtp(id.value, purpose, otp))) {
    throw new AppError(400, "INVALID_OTP", "Invalid OTP");
  }

  await prisma.otpVerification.update({ where: { id: row.id }, data: { verifiedAt: new Date() } });
  return { verificationId: row.id };
}

async function requireVerification(verificationId: string, id: Identifier, purpose: OtpPurposeName) {
  const row = await prisma.otpVerification.findUnique({ where: { id: verificationId } });
  const valid =
    row !== null &&
    row.verifiedAt !== null &&
    row.identifier === id.value &&
    row.purpose === purpose &&
    Date.now() - row.verifiedAt.getTime() <= VERIFIED_TTL_MS;

  if (!valid) {
    throw new AppError(400, "VERIFICATION_REQUIRED", "Please verify your OTP again.");
  }
  return row;
}

// ---------- register / login ----------

export async function register(
  input: {
    identifier: string;
    ownerName: string;
    shopName: string;
    password: string;
    verificationId: string;
  },
  ctx: RequestContext
) {
  assertRegistrationOpen();

  const id = mustParse(input.identifier);
  const verification = await requireVerification(input.verificationId, id, "REGISTER");
  const passwordHash = await hashPassword(input.password);

  try {
    const { shop, user } = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: input.shopName,
          phone: id.type === "phone" ? id.value : null,
          email: id.type === "email" ? id.value : null,
          settings: { create: {} },
        },
      });

      const user = await tx.user.create({
        data: {
          shopId: shop.id,
          name: input.ownerName,
          phone: id.type === "phone" ? id.value : null,
          email: id.type === "email" ? id.value : null,
          passwordHash,
          role: "OWNER",
          staff: { create: {} },
        },
      });

      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((name) => ({ shopId: shop.id, name })),
      });

      // The OTP can only be used once
      await tx.otpVerification.delete({ where: { id: verification.id } });

      return { shop, user };
    });

    await logAudit(
      { shopId: shop.id, userId: user.id, action: "SHOP_REGISTERED", entity: "shop", entityId: shop.id },
      ctx
    );

    const refreshToken = await createRefreshToken(user.id, ctx);
    return {
      accessToken: signAccessToken(user),
      refreshToken,
      user: toPublicUser({ ...user, shop: { id: shop.id, name: shop.name } }),
    };
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError(
        409,
        "ALREADY_REGISTERED",
        "This mobile number or email is already registered. Please log in."
      );
    }
    throw err;
  }
}

export async function login(rawIdentifier: string, password: string, ctx: RequestContext) {
  const id = parseIdentifier(rawIdentifier);
  const user = id ? await findUserByIdentifier(id) : null;

  // Always run a password check so a missing account takes the same time as a wrong password
  const passwordOk = await comparePassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid login credentials.");
  }
  if (!user.isActive) {
    throw new AppError(403, "ACCOUNT_DISABLED", "This account has been disabled. Please contact the owner.");
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  // Housekeeping: sessions that can no longer be used are removed
  await prisma.refreshToken.deleteMany({
    where: {
      userId: user.id,
      OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 7 * DAY_MS) } }],
    },
  });

  const refreshToken = await createRefreshToken(user.id, ctx);
  await logAudit({ shopId: user.shopId, userId: user.id, action: "LOGIN" }, ctx);

  return { accessToken: signAccessToken(user), refreshToken, user: toPublicUser(user) };
}

// ---------- refresh / logout ----------

export async function refreshSession(token: string | undefined, ctx: RequestContext) {
  const unauthorized = new AppError(401, "SESSION_EXPIRED", "Your session has expired. Please log in again.");
  if (!token) throw unauthorized;

  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { shop: { select: { id: true, name: true } } } } },
  });
  if (!row) throw unauthorized;

  if (row.revokedAt) {
    // An old token used again long after it was replaced looks like theft: end every session.
    if (Date.now() - row.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
      await prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized;
  }
  if (row.expiresAt < new Date() || !row.user.isActive) throw unauthorized;

  const newToken = generateRefreshToken();
  await prisma.$transaction(async (tx) => {
    // Claim the old token. If another request already did, count is 0 and we stop.
    const claimed = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) throw unauthorized;

    await tx.refreshToken.create({
      data: {
        userId: row.userId,
        tokenHash: hashToken(newToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  });

  return {
    accessToken: signAccessToken(row.user),
    refreshToken: newToken,
    user: toPublicUser(row.user),
  };
}

export async function logout(token: string | undefined, ctx: RequestContext): Promise<void> {
  if (!token) return;
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { shopId: true } } },
  });
  if (!row) return;

  await prisma.refreshToken.updateMany({
    where: { id: row.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await logAudit({ shopId: row.user.shopId, userId: row.userId, action: "LOGOUT" }, ctx);
}

// ---------- password reset / profile ----------

export async function resetPassword(
  input: { identifier: string; verificationId: string; newPassword: string },
  ctx: RequestContext
): Promise<void> {
  const id = mustParse(input.identifier);
  const verification = await requireVerification(input.verificationId, id, "RESET");

  const user = await findUserByIdentifier(id);
  if (!user || !user.isActive) {
    throw new AppError(400, "VERIFICATION_REQUIRED", "Please verify your OTP again.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    // A password reset logs the user out everywhere
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.otpVerification.delete({ where: { id: verification.id } }),
  ]);

  await logAudit({ shopId: user.shopId, userId: user.id, action: "PASSWORD_RESET" }, ctx);
}

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { shop: { select: { id: true, name: true } } },
  });
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");
  return toPublicUser(user);
}
