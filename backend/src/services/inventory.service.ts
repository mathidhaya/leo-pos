import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { resolveRange } from "../utils/dateRange";
import { isUniqueViolation } from "../utils/prismaErrors";
import { MAX_STOCK, stockStatus } from "../utils/stockStatus";
import type { AdjustInput, ListInventoryQuery, ListMovementsQuery } from "../validators/inventory.validators";
import { logAudit, type RequestContext } from "./audit.service";

type Actor = { id: string; shopId: string; role: RoleName };

const itemSelect = {
  id: true,
  name: true,
  sku: true,
  imageUrl: true,
  isAvailable: true,
  category: { select: { id: true, name: true } },
  inventory: { select: { quantity: true, minStock: true, updatedAt: true } },
} satisfies Prisma.ProductSelect;

type ItemRow = Prisma.ProductGetPayload<{ select: typeof itemSelect }>;

function toItem(row: ItemRow, added30: number, removed30: number) {
  const quantity = row.inventory?.quantity ?? 0;
  const minStock = row.inventory?.minStock ?? 0;
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    imageUrl: row.imageUrl,
    category: row.category,
    isAvailable: row.isAvailable,
    quantity,
    minStock,
    status: stockStatus(quantity, minStock),
    updatedAt: row.inventory?.updatedAt ? row.inventory.updatedAt.toISOString() : null,
    added30,
    removed30,
  };
}

// How much came in and went out in the last 30 days, for the products being shown
async function movementTotals(productIds: string[]) {
  const added = new Map<string, number>();
  const removed = new Map<string, number>();
  if (productIds.length === 0) return { added, removed };

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const base = { productId: { in: productIds }, createdAt: { gte: since } };

  const [plus, minus] = await Promise.all([
    prisma.inventoryTransaction.groupBy({
      by: ["productId"],
      where: { ...base, quantityChange: { gt: 0 } },
      _sum: { quantityChange: true },
    }),
    prisma.inventoryTransaction.groupBy({
      by: ["productId"],
      where: { ...base, quantityChange: { lt: 0 } },
      _sum: { quantityChange: true },
    }),
  ]);

  for (const row of plus) added.set(row.productId, row._sum.quantityChange ?? 0);
  for (const row of minus) removed.set(row.productId, Math.abs(row._sum.quantityChange ?? 0));
  return { added, removed };
}

async function loadItem(shopId: string, productId: string) {
  const row = await prisma.product.findFirst({ where: { id: productId, shopId }, select: itemSelect });
  if (!row) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");
  const { added, removed } = await movementTotals([productId]);
  return toItem(row, added.get(productId) ?? 0, removed.get(productId) ?? 0);
}

// Product ids that are out of stock, or low. The shop id is passed as a bound parameter.
async function stockProductIds(shopId: string, kind: "low" | "out"): Promise<string[]> {
  const rows =
    kind === "out"
      ? await prisma.$queryRaw<Array<{ product_id: string }>>`
          SELECT p.id AS product_id FROM products p
          LEFT JOIN inventory i ON i.product_id = p.id
          WHERE p.shop_id = ${shopId}::uuid AND COALESCE(i.quantity, 0) = 0`
      : await prisma.$queryRaw<Array<{ product_id: string }>>`
          SELECT p.id AS product_id FROM products p
          JOIN inventory i ON i.product_id = p.id
          WHERE p.shop_id = ${shopId}::uuid AND i.quantity > 0 AND i.quantity <= i.min_stock`;
  return rows.map((row) => row.product_id);
}

// ---------- the stock list, with alerts ----------

export async function listInventory(user: Actor, query: ListInventoryQuery) {
  const where: Prisma.ProductWhereInput = { shopId: user.shopId };

  if (query.q) {
    where.OR = [
      { name: { contains: query.q, mode: "insensitive" } },
      { sku: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.stock !== "all") where.id = { in: await stockProductIds(user.shopId, query.stock) };

  // Alerts and the summary only count products that are available for sale
  const [total, rows, summaryRows, alertRows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: itemSelect,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.$queryRaw<Array<{ active: number; low: number; outOfStock: number }>>`
      SELECT
        COUNT(*)::int AS "active",
        (COUNT(*) FILTER (WHERE COALESCE(i.quantity, 0) > 0 AND COALESCE(i.quantity, 0) <= COALESCE(i.min_stock, 0)))::int AS "low",
        (COUNT(*) FILTER (WHERE COALESCE(i.quantity, 0) = 0))::int AS "outOfStock"
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.shop_id = ${user.shopId}::uuid AND p.is_available = true`,
    prisma.$queryRaw<Array<{ id: string; name: string; sku: string; quantity: number; minStock: number }>>`
      SELECT p.id, p.name, p.sku,
        COALESCE(i.quantity, 0)::int AS "quantity",
        COALESCE(i.min_stock, 0)::int AS "minStock"
      FROM products p
      LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.shop_id = ${user.shopId}::uuid
        AND p.is_available = true
        AND COALESCE(i.quantity, 0) <= COALESCE(i.min_stock, 0)
      ORDER BY (COALESCE(i.quantity, 0) = 0) DESC, COALESCE(i.quantity, 0) ASC, p.name ASC
      LIMIT 10`,
  ]);

  const { added, removed } = await movementTotals(rows.map((row) => row.id));
  const summary = summaryRows[0] ?? { active: 0, low: 0, outOfStock: 0 };

  return {
    items: rows.map((row) => toItem(row, added.get(row.id) ?? 0, removed.get(row.id) ?? 0)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    summary: { activeProducts: summary.active, low: summary.low, outOfStock: summary.outOfStock },
    alerts: alertRows.map((row) => ({ ...row, status: row.quantity === 0 ? ("out" as const) : ("low" as const) })),
  };
}

// ---------- changing the stock ----------

// The same request key arriving again returns the change that was already saved
async function findKnown(user: Actor, input: AdjustInput) {
  const row = await prisma.inventoryTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { productId: true, product: { select: { shopId: true } } },
  });
  if (!row) return null;

  if (row.product.shopId !== user.shopId || row.productId !== input.productId) {
    throw new AppError(409, "KEY_REUSED", "This request was already used. Please try again.");
  }
  return loadItem(user.shopId, row.productId);
}

export async function adjustStock(user: Actor, input: AdjustInput, ctx: RequestContext) {
  const known = await findKnown(user, input);
  if (known) return { item: known, duplicate: true };

  try {
    // The stock change and its history row are saved together, or not at all
    const change = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: input.productId, shopId: user.shopId },
        select: { id: true, name: true },
      });
      if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");

      let inventory = await tx.inventory.findUnique({ where: { productId: product.id }, select: { quantity: true } });
      if (!inventory) {
        inventory = await tx.inventory.create({
          data: { productId: product.id, quantity: 0, minStock: 0 },
          select: { quantity: true },
        });
      }
      const current = inventory.quantity;

      let quantityChange: number;
      let reason: string;

      if (input.action === "IN") {
        if (current + input.quantity > MAX_STOCK) {
          throw new AppError(
            422,
            "STOCK_TOO_LARGE",
            `Stock cannot be more than ${MAX_STOCK.toLocaleString("en-IN")}. There are ${current} now.`
          );
        }
        await tx.inventory.update({ where: { productId: product.id }, data: { quantity: { increment: input.quantity } } });
        quantityChange = input.quantity;
        reason = input.reason || "Stock added";
      } else if (input.action === "OUT") {
        // "quantity >= amount" is checked and changed in one step, so it can never go below zero
        const updated = await tx.inventory.updateMany({
          where: { productId: product.id, quantity: { gte: input.quantity } },
          data: { quantity: { decrement: input.quantity } },
        });
        if (updated.count === 0) {
          throw new AppError(422, "INSUFFICIENT_STOCK", `Only ${current} of "${product.name}" in stock, so ${input.quantity} cannot be removed.`);
        }
        quantityChange = -input.quantity;
        reason = input.reason;
      } else {
        const changedMessage = (now: number) =>
          `Stock changed from ${input.expectedQuantity} to ${now} while you were counting. Close this window and count again.`;

        if (current !== input.expectedQuantity) {
          throw new AppError(409, "STOCK_CHANGED", changedMessage(current));
        }
        if (input.newQuantity === current) {
          throw new AppError(422, "NO_CHANGE", "The count is the same as the current stock, so there is nothing to change.");
        }
        // Only change it if nobody else changed it in the meantime
        const updated = await tx.inventory.updateMany({
          where: { productId: product.id, quantity: current },
          data: { quantity: input.newQuantity },
        });
        if (updated.count === 0) {
          throw new AppError(409, "STOCK_CHANGED", "The stock changed while you were counting. Close this window and count again.");
        }
        quantityChange = input.newQuantity - current;
        reason = input.reason;
      }

      await tx.inventoryTransaction.create({
        data: {
          productId: product.id,
          type: input.action,
          quantityChange,
          reason,
          userId: user.id,
          idempotencyKey: input.idempotencyKey,
        },
      });

      return { productName: product.name, quantityChange, reason, before: current };
    });

    const item = await loadItem(user.shopId, input.productId);

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "INVENTORY_ADJUSTED",
        entity: "product",
        entityId: input.productId,
        details: {
          product: change.productName,
          type: input.action,
          change: change.quantityChange,
          from: change.before,
          to: item.quantity,
          reason: change.reason,
        },
      },
      ctx
    );
    return { item, duplicate: false };
  } catch (err) {
    // Two identical requests at the same moment: the second one gets the first one's result
    if (isUniqueViolation(err)) {
      const raced = await findKnown(user, input);
      if (raced) return { item: raced, duplicate: true };
    }
    throw err;
  }
}

// ---------- the history ----------

export async function listMovements(user: Actor, query: ListMovementsQuery) {
  const where: Prisma.InventoryTransactionWhereInput = { product: { shopId: user.shopId } };

  if (query.productId) where.productId = query.productId;
  if (query.type !== "all") where.type = query.type;
  if (query.from && query.to) {
    const range = resolveRange({ range: "custom", from: query.from, to: query.to });
    where.createdAt = { gte: range.start, lt: range.end };
  }
  if (query.q) {
    where.OR = [
      { product: { name: { contains: query.q, mode: "insensitive" } } },
      { product: { sku: { contains: query.q, mode: "insensitive" } } },
      { reason: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.inventoryTransaction.count({ where }),
    prisma.inventoryTransaction.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        createdAt: true,
        type: true,
        quantityChange: true,
        reason: true,
        product: { select: { id: true, name: true, sku: true } },
        user: { select: { name: true } },
        order: { select: { orderNo: true } },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      productId: row.product.id,
      productName: row.product.name,
      sku: row.product.sku,
      type: row.type,
      quantityChange: row.quantityChange,
      reason: row.reason,
      by: row.user?.name ?? null,
      orderNo: row.order?.orderNo ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
