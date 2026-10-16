import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";
import { parseIdentifier, type Identifier } from "../utils/identifier";
import { hashPassword } from "../utils/password";
import { isUniqueViolation } from "../utils/prismaErrors";
import { generateTempPassword } from "../utils/tempPassword";
import { logAudit } from "./audit.service";

const DEFAULT_CATEGORIES = ["Coffee", "Tea", "Fast Food", "Beverages", "Snacks", "Desserts"];

function mustParse(raw: string): Identifier {
  const id = parseIdentifier(raw);
  if (!id) throw new AppError(400, "INVALID_IDENTIFIER", "Enter a valid email address or a 10-digit mobile number.");
  return id;
}

const where = (id: Identifier) => (id.type === "email" ? { email: id.value } : { phone: id.value });

// Creates a new cafe with its owner, from the command line (no code needed). The password is made here
// and returned once. Only its hash is saved.
export async function createOwnerAccount(input: { shopName: string; ownerName: string; identifier: string }) {
  const shopName = input.shopName.trim();
  const ownerName = input.ownerName.trim();

  if (shopName.length < 2 || shopName.length > 100) {
    throw new AppError(400, "INVALID_INPUT", "The cafe name must be 2 to 100 characters.");
  }
  if (ownerName.length < 2 || ownerName.length > 80) {
    throw new AppError(400, "INVALID_INPUT", "The owner's name must be 2 to 80 characters.");
  }

  const id = mustParse(input.identifier);
  const alreadyRegistered = () =>
    new AppError(409, "ALREADY_REGISTERED", "This email or mobile number already has an account.");

  if (await prisma.user.findFirst({ where: where(id), select: { id: true } })) throw alreadyRegistered();

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);

  try {
    const { shop, user } = await prisma.$transaction(async (tx) => {
      const shop = await tx.shop.create({
        data: {
          name: shopName,
          phone: id.type === "phone" ? id.value : null,
          email: id.type === "email" ? id.value : null,
          settings: { create: {} },
        },
      });
      const user = await tx.user.create({
        data: {
          shopId: shop.id,
          name: ownerName,
          phone: id.type === "phone" ? id.value : null,
          email: id.type === "email" ? id.value : null,
          passwordHash,
          role: "OWNER",
          staff: { create: {} },
        },
      });
      await tx.category.createMany({ data: DEFAULT_CATEGORIES.map((name) => ({ shopId: shop.id, name })) });
      return { shop, user };
    });

    await logAudit({
      shopId: shop.id,
      userId: user.id,
      action: "SHOP_REGISTERED",
      entity: "shop",
      entityId: shop.id,
      details: { via: "command line" },
    });

    return { shopId: shop.id, userId: user.id, login: id.value, password };
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyRegistered();
    throw err;
  }
}

// A way back in when nobody can log in and codes cannot be sent. Gives the person a new password
// and logs them out everywhere.
export async function resetPasswordByLogin(identifier: string) {
  const id = mustParse(identifier);
  const user = await prisma.user.findFirst({
    where: where(id),
    select: { id: true, name: true, role: true, shopId: true },
  });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "No account has that email or mobile number.");

  const password = generateTempPassword();
  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);

  // The audit entry says that a reset happened. It never contains the password.
  await logAudit({
    shopId: user.shopId,
    userId: user.id,
    action: "PASSWORD_RESET",
    entity: "user",
    entityId: user.id,
    details: { via: "command line" },
  });

  return { name: user.name, role: user.role, login: id.value, password };
}
