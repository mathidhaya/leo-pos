import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { hashPassword } from "../utils/password";
import { isForeignKeyViolation, isUniqueViolation } from "../utils/prismaErrors";
import { generateTempPassword } from "../utils/tempPassword";
import type { ListStaffQuery, StaffInput } from "../validators/staff.validators";
import { logAudit, type RequestContext } from "./audit.service";

type Actor = { id: string; shopId: string; role: RoleName };

const staffSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  staff: { select: { joiningDate: true } },
  _count: { select: { orders: true, payments: true, inventoryTransactions: true } },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

// Never includes the password hash. Only these fields ever leave the server.
function toDto(row: StaffRow) {
  const hasHistory = row._count.orders + row._count.payments + row._count.inventoryTransactions > 0;
  const isOwner = row.role === "OWNER";
  const joined = row.staff?.joiningDate ?? row.createdAt;

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    joiningDate: joined.toISOString().slice(0, 10),
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    ordersTaken: row._count.orders,
    hasHistory,
    canModify: !isOwner,
    canDelete: !isOwner && !hasHistory,
  };
}

const notFound = () => new AppError(404, "STAFF_NOT_FOUND", "Staff member not found.");
const ownerProtected = () =>
  new AppError(403, "OWNER_PROTECTED", "The owner account cannot be changed here. Use Settings for your own details.");
const phoneTaken = () => new AppError(409, "PHONE_EXISTS", "This mobile number is already registered to an account.");
const emailTaken = () => new AppError(409, "EMAIL_EXISTS", "This email is already registered to an account.");

// Dates are stored as plain dates (no time), so they are built at UTC midnight to avoid shifting by a day
const toDateOnly = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// A phone number or email is a login, so it can belong to only one account in the whole system
async function assertContactFree(phone: string, email: string | null, exceptId?: string): Promise<void> {
  const clash = await prisma.user.findFirst({
    where: {
      OR: [{ phone }, ...(email ? [{ email }] : [])],
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { phone: true },
  });
  if (!clash) return;
  throw clash.phone === phone ? phoneTaken() : emailTaken();
}

// Ends every login of this person. Their next request needs a fresh login.
const revokeSessions = (tx: Prisma.TransactionClient, userId: string) =>
  tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });

async function loadStaff(shopId: string, id: string) {
  const row = await prisma.user.findFirst({ where: { id, shopId }, select: staffSelect });
  if (!row) throw notFound();
  return toDto(row);
}

// The person to change. The owner is never changed through this page.
async function findTarget(shopId: string, id: string) {
  const target = await prisma.user.findFirst({
    where: { id, shopId },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!target) throw notFound();
  if (target.role === "OWNER") throw ownerProtected();
  return target;
}

// ---------- list ----------

export async function listStaff(user: Actor, query: ListStaffQuery) {
  const where: Prisma.UserWhereInput = { shopId: user.shopId };

  if (query.q) {
    const digits = query.q.replace(/\D/g, "");
    const or: Prisma.UserWhereInput[] = [
      { name: { contains: query.q, mode: "insensitive" } },
      { email: { contains: query.q, mode: "insensitive" } },
    ];
    if (digits.length >= 3) or.push({ phone: { contains: digits } });
    where.OR = or;
  }
  if (query.role !== "all") where.role = query.role;
  if (query.status === "active") where.isActive = true;
  if (query.status === "disabled") where.isActive = false;

  const [rows, groups] = await Promise.all([
    prisma.user.findMany({
      where,
      select: staffSelect,
      // Owner first, then managers, then cashiers (the order the roles were declared in)
      orderBy: [{ role: "asc" }, { name: "asc" }, { id: "asc" }],
      take: 500,
    }),
    prisma.user.groupBy({ by: ["isActive"], where: { shopId: user.shopId }, _count: { _all: true } }),
  ]);

  const active = groups.find((g) => g.isActive)?._count._all ?? 0;
  const disabled = groups.find((g) => !g.isActive)?._count._all ?? 0;

  return { items: rows.map(toDto), summary: { total: active + disabled, active, disabled } };
}

// ---------- create ----------

export async function createStaff(user: Actor, input: StaffInput, ctx: RequestContext) {
  await assertContactFree(input.phone, input.email);

  // The password is made here and shown to the owner once. Only its hash is saved.
  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  try {
    const created = await prisma.user.create({
      data: {
        shopId: user.shopId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: true,
        staff: { create: { joiningDate: toDateOnly(input.joiningDate) } },
      },
      select: { id: true },
    });

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "STAFF_CREATED",
        entity: "user",
        entityId: created.id,
        details: { name: input.name, role: input.role },
      },
      ctx
    );

    return { staff: await loadStaff(user.shopId, created.id), temporaryPassword };
  } catch (err) {
    // Someone else registered the same number or email a moment ago
    if (isUniqueViolation(err)) {
      await assertContactFree(input.phone, input.email);
      throw phoneTaken();
    }
    throw err;
  }
}

// ---------- update ----------

export async function updateStaff(user: Actor, id: string, input: StaffInput, ctx: RequestContext) {
  const target = await findTarget(user.shopId, id);
  await assertContactFree(input.phone, input.email, id);

  const roleChanged = target.role !== input.role;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { name: input.name, phone: input.phone, email: input.email, role: input.role },
      });
      const joiningDate = toDateOnly(input.joiningDate);
      await tx.staff.upsert({
        where: { userId: id },
        update: { joiningDate },
        create: { userId: id, joiningDate },
      });
      // A new role means a fresh login, so their screen matches what they are allowed to do
      if (roleChanged) await revokeSessions(tx, id);
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      await assertContactFree(input.phone, input.email, id);
      throw phoneTaken();
    }
    throw err;
  }

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "STAFF_UPDATED",
      entity: "user",
      entityId: id,
      details: { name: input.name },
    },
    ctx
  );
  if (roleChanged) {
    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "STAFF_ROLE_CHANGED",
        entity: "user",
        entityId: id,
        details: { name: input.name, from: target.role, to: input.role },
      },
      ctx
    );
  }

  return loadStaff(user.shopId, id);
}

// ---------- disable / enable ----------

export async function setStaffStatus(user: Actor, id: string, isActive: boolean, ctx: RequestContext) {
  const target = await findTarget(user.shopId, id);
  if (target.isActive === isActive) return loadStaff(user.shopId, id);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { isActive } });
    // A disabled person is logged out of every device straight away
    if (!isActive) await revokeSessions(tx, id);
  });

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: isActive ? "STAFF_ENABLED" : "STAFF_DISABLED",
      entity: "user",
      entityId: id,
      details: { name: target.name },
    },
    ctx
  );

  return loadStaff(user.shopId, id);
}

// ---------- reset password ----------

export async function resetStaffPassword(user: Actor, id: string, ctx: RequestContext) {
  const target = await findTarget(user.shopId, id);

  const temporaryPassword = generateTempPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    await revokeSessions(tx, id);
  });

  // The audit entry says that a reset happened. It never contains the password.
  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "STAFF_PASSWORD_RESET",
      entity: "user",
      entityId: id,
      details: { name: target.name },
    },
    ctx
  );

  return { staff: await loadStaff(user.shopId, id), temporaryPassword };
}

// ---------- delete ----------

// Only for accounts that never did anything. Anyone who took an order or payment, or changed stock,
// has to stay, because those records say who did it. Disable them instead.
export async function deleteStaff(user: Actor, id: string, ctx: RequestContext) {
  const target = await prisma.user.findFirst({
    where: { id, shopId: user.shopId },
    select: {
      id: true,
      name: true,
      role: true,
      _count: { select: { orders: true, payments: true, inventoryTransactions: true } },
    },
  });
  if (!target) throw notFound();
  if (target.role === "OWNER") throw ownerProtected();

  const hasHistory = new AppError(
    409,
    "STAFF_HAS_HISTORY",
    "This person has taken orders or payments, or changed stock, so they cannot be deleted. Disable the account instead."
  );

  const { orders, payments, inventoryTransactions } = target._count;
  if (orders + payments + inventoryTransactions > 0) throw hasHistory;

  try {
    await prisma.user.delete({ where: { id } });
  } catch (err) {
    // They took an order at this very moment
    if (isForeignKeyViolation(err)) throw hasHistory;
    throw err;
  }

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "STAFF_DELETED",
      entity: "user",
      entityId: id,
      details: { name: target.name, role: target.role },
    },
    ctx
  );
}
