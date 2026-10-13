import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { changedFields } from "../utils/changedFields";
import { comparePassword, hashPassword } from "../utils/password";
import { isUniqueViolation } from "../utils/prismaErrors";
import { hashToken } from "../utils/tokens";
import type { ChangePasswordInput, ProfileInput } from "../validators/settings.validators";
import { logAudit, type RequestContext } from "./audit.service";

type Actor = { id: string; shopId: string; role: RoleName };

const phoneTaken = () => new AppError(409, "PHONE_EXISTS", "This mobile number is already registered to an account.");
const emailTaken = () => new AppError(409, "EMAIL_EXISTS", "This email is already registered to an account.");
const wrongPassword = () => new AppError(400, "WRONG_CURRENT_PASSWORD", "The current password is not correct.");

// A phone number or email is a login, so it can belong to only one account in the whole system
async function assertLoginFree(phone: string | null, email: string | null, exceptId: string): Promise<void> {
  const or: Array<{ phone: string } | { email: string }> = [];
  if (phone) or.push({ phone });
  if (email) or.push({ email });
  if (or.length === 0) return;

  const clash = await prisma.user.findFirst({
    where: { OR: or, id: { not: exceptId } },
    select: { phone: true },
  });
  if (!clash) return;
  throw phone && clash.phone === phone ? phoneTaken() : emailTaken();
}

// ---------- reading ----------

// Never includes the password hash
export async function getAccount(user: Actor) {
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      lastLoginAt: true,
      createdAt: true,
      staff: { select: { joiningDate: true } },
    },
  });
  if (!me) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");

  return {
    id: me.id,
    name: me.name,
    phone: me.phone,
    email: me.email,
    role: me.role,
    lastLoginAt: me.lastLoginAt ? me.lastLoginAt.toISOString() : null,
    joiningDate: (me.staff?.joiningDate ?? me.createdAt).toISOString().slice(0, 10),
    // Staff logins are issued by the owner, so only the owner can change their own
    canChangeLogin: me.role === "OWNER",
  };
}

// ---------- profile ----------

export async function updateProfile(user: Actor, input: ProfileInput, ctx: RequestContext) {
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true, phone: true, email: true, passwordHash: true, role: true },
  });
  if (!me) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");

  const loginChanged = input.phone !== me.phone || input.email !== me.email;

  if (loginChanged) {
    if (me.role !== "OWNER") {
      throw new AppError(
        403,
        "LOGIN_MANAGED_BY_OWNER",
        "Your mobile number and email can only be changed by the owner. Please ask them."
      );
    }
    // Your login is how you get in, so changing it needs your password again
    if (!input.currentPassword) {
      throw new AppError(
        400,
        "PASSWORD_REQUIRED",
        "Enter your current password to change your mobile number or email."
      );
    }
    if (!(await comparePassword(input.currentPassword, me.passwordHash))) throw wrongPassword();
    await assertLoginFree(input.phone, input.email, user.id);
  }

  const data = {
    name: input.name,
    ...(loginChanged ? { phone: input.phone, email: input.email } : {}),
  };
  const changed = changedFields({ name: me.name, phone: me.phone, email: me.email }, data);

  if (changed.length > 0) {
    try {
      await prisma.user.update({ where: { id: user.id }, data });
    } catch (err) {
      if (isUniqueViolation(err)) {
        await assertLoginFree(input.phone, input.email, user.id);
        throw phoneTaken();
      }
      throw err;
    }

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "PROFILE_UPDATED",
        entity: "user",
        entityId: user.id,
        details: { changed: changed.join(", ") },
      },
      ctx
    );
  }

  return getAccount(user);
}

// ---------- password ----------

// Changes the password and ends the sessions on every OTHER device. The device you are using stays logged in.
export async function changePassword(
  user: Actor,
  input: ChangePasswordInput,
  currentRefreshToken: string | undefined,
  ctx: RequestContext
) {
  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!me) throw new AppError(401, "UNAUTHENTICATED", "Please log in to continue.");

  if (!(await comparePassword(input.currentPassword, me.passwordHash))) throw wrongPassword();

  const passwordHash = await hashPassword(input.newPassword);
  const keep = currentRefreshToken ? hashToken(currentRefreshToken) : null;

  const [, ended] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null, ...(keep ? { tokenHash: { not: keep } } : {}) },
      data: { revokedAt: new Date() },
    }),
  ]);

  // The audit entry says that the password changed. It never contains a password.
  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "PASSWORD_CHANGED",
      entity: "user",
      entityId: user.id,
      details: { otherSessionsEnded: ended.count },
    },
    ctx
  );

  return { otherSessionsEnded: ended.count };
}
