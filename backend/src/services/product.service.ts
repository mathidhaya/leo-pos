import { escapeLike } from "../utils/sql";
import crypto from "crypto";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { isForeignKeyViolation, isUniqueViolation } from "../utils/prismaErrors";
import type {
  CreateProductInput,
  ListProductsQuery,
  UpdateProductInput,
} from "../validators/catalog.validators";
import { logAudit, type RequestContext } from "./audit.service";
import { deleteUploadedImage } from "./upload.service";

type Actor = { id: string; shopId: string; role: RoleName };

const productInclude = {
  category: { select: { id: true, name: true } },
  inventory: { select: { quantity: true, minStock: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

// Money is calculated in whole paise (integers), so there are no rounding errors.
function toPaise(value: { toString(): string }): number {
  return Math.round(Number(value.toString()) * 100);
}
const fromPaise = (paise: number): string => (paise / 100).toFixed(2);

// Cost and profit are business-sensitive, so cashiers do not receive them.
function toDto(product: ProductRow, canSeeCost: boolean) {
  const quantity = product.inventory?.quantity ?? 0;
  const minStock = product.inventory?.minStock ?? 0;
  const selling = toPaise(product.sellingPrice);
  const cost = toPaise(product.costPrice);

  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    description: product.description,
    imageUrl: product.imageUrl,
    sellingPrice: fromPaise(selling),
    costPrice: canSeeCost ? fromPaise(cost) : null,
    profit: canSeeCost ? fromPaise(selling - cost) : null,
    gstPercent: product.gstPercent.toFixed(2),
    prepTimeMin: product.prepTimeMin,
    isAvailable: product.isAvailable,
    category: product.category,
    stock: {
      quantity,
      minStock,
      status: quantity === 0 ? "out" : quantity <= minStock ? "low" : "ok",
    },
    createdAt: product.createdAt.toISOString(),
  };
}

const notFound = () => new AppError(404, "PRODUCT_NOT_FOUND", "Product not found.");
const skuTaken = () =>
  new AppError(409, "SKU_TAKEN", "This product code is already used by another product.");

async function assertCategory(shopId: string, categoryId: string): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, shopId },
    select: { id: true },
  });
  if (!category) throw new AppError(400, "INVALID_CATEGORY", "Please choose a valid category.");
}

// No look-alike characters (0/O, 1/I) so codes are easy to read out
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomSku(): string {
  let code = "P-";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
}

// Product ids that are out of stock, or low (above zero but at or under the minimum).
// The shop id is passed as a bound parameter, never pasted into the SQL.
async function stockProductIds(shopId: string, kind: "low" | "out"): Promise<string[]> {
  const rows =
    kind === "out"
      ? await prisma.$queryRaw<Array<{ product_id: string }>>`
          SELECT i.product_id FROM inventory i
          JOIN products p ON p.id = i.product_id
          WHERE p.shop_id = ${shopId}::uuid AND i.quantity = 0`
      : await prisma.$queryRaw<Array<{ product_id: string }>>`
          SELECT i.product_id FROM inventory i
          JOIN products p ON p.id = i.product_id
          WHERE p.shop_id = ${shopId}::uuid AND i.quantity > 0 AND i.quantity <= i.min_stock`;
  return rows.map((row) => row.product_id);
}

export async function listProducts(user: Actor, query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = { shopId: user.shopId };

  if (query.q) {
    where.OR = [
      { name: { contains: escapeLike(query.q), mode: "insensitive" } },
      { sku: { contains: escapeLike(query.q), mode: "insensitive" } },
    ];
  }
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.status === "active") where.isAvailable = true;
  if (query.status === "inactive") where.isAvailable = false;
  if (query.stock !== "all") {
    where.id = { in: await stockProductIds(user.shopId, query.stock) };
  }

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const canSeeCost = user.role !== "CASHIER";
  return {
    items: rows.map((row) => toDto(row, canSeeCost)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function getProduct(user: Actor, id: string) {
  const product = await prisma.product.findFirst({
    where: { id, shopId: user.shopId },
    include: productInclude,
  });
  if (!product) throw notFound();
  return toDto(product, user.role !== "CASHIER");
}

export async function createProduct(user: Actor, input: CreateProductInput, ctx: RequestContext) {
  await assertCategory(user.shopId, input.categoryId);

  const chosenSku = input.sku ? input.sku : undefined;
  const maxAttempts = chosenSku ? 1 : 6;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sku = chosenSku ?? randomSku();

    try {
      // Product, stock row and stock history are saved together, or not at all
      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            shopId: user.shopId,
            categoryId: input.categoryId,
            name: input.name,
            sku,
            description: input.description,
            imageUrl: input.imageUrl ?? null,
            sellingPrice: input.sellingPrice,
            costPrice: input.costPrice,
            gstPercent: input.gstPercent,
            prepTimeMin: input.prepTimeMin ?? null,
            isAvailable: input.isAvailable,
            inventory: { create: { quantity: input.stockQuantity, minStock: input.minStock } },
          },
          include: productInclude,
        });

        if (input.stockQuantity > 0) {
          await tx.inventoryTransaction.create({
            data: {
              productId: created.id,
              type: "IN",
              quantityChange: input.stockQuantity,
              reason: "Opening stock",
              userId: user.id,
            },
          });
        }
        return created;
      });

      await logAudit(
        {
          shopId: user.shopId,
          userId: user.id,
          action: "PRODUCT_CREATED",
          entity: "product",
          entityId: product.id,
          details: { name: product.name, sku: product.sku },
        },
        ctx
      );
      return toDto(product, true);
    } catch (err) {
      if (isUniqueViolation(err)) {
        if (chosenSku) throw skuTaken();
        continue; // a generated code collided: try another one
      }
      throw err;
    }
  }

  throw new AppError(503, "SKU_GENERATION_FAILED", "Could not create a product code. Please try again.");
}

export async function updateProduct(user: Actor, id: string, input: UpdateProductInput, ctx: RequestContext) {
  const existing = await prisma.product.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true, sku: true, imageUrl: true },
  });
  if (!existing) throw notFound();

  await assertCategory(user.shopId, input.categoryId);

  // A blank code keeps the current one
  const sku = input.sku ? input.sku : existing.sku;

  try {
    const product = await prisma.$transaction(async (tx) => {
      await tx.inventory.upsert({
        where: { productId: id },
        update: { minStock: input.minStock },
        create: { productId: id, quantity: 0, minStock: input.minStock },
      });

      return tx.product.update({
        where: { id },
        data: {
          categoryId: input.categoryId,
          name: input.name,
          sku,
          description: input.description,
          sellingPrice: input.sellingPrice,
          costPrice: input.costPrice,
          gstPercent: input.gstPercent,
          prepTimeMin: input.prepTimeMin ?? null,
          isAvailable: input.isAvailable,
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        },
        include: productInclude,
      });
    });

    if (input.imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== input.imageUrl) {
      await deleteUploadedImage(existing.imageUrl);
    }

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "PRODUCT_UPDATED",
        entity: "product",
        entityId: id,
        details: { name: product.name, sku: product.sku },
      },
      ctx
    );
    return toDto(product, true);
  } catch (err) {
    if (isUniqueViolation(err)) throw skuTaken();
    throw err;
  }
}

export async function setAvailability(user: Actor, id: string, isAvailable: boolean, ctx: RequestContext) {
  const existing = await prisma.product.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true },
  });
  if (!existing) throw notFound();

  const product = await prisma.product.update({
    where: { id },
    data: { isAvailable },
    include: productInclude,
  });

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "PRODUCT_UPDATED",
      entity: "product",
      entityId: id,
      details: { name: product.name, isAvailable },
    },
    ctx
  );
  return toDto(product, true);
}

export async function deleteProduct(user: Actor, id: string, ctx: RequestContext) {
  const existing = await prisma.product.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true, name: true, sku: true, imageUrl: true },
  });
  if (!existing) throw notFound();

  const hasSales = new AppError(
    409,
    "PRODUCT_HAS_SALES",
    "This product has been sold before, so it cannot be deleted. Disable it instead."
  );

  const soldCount = await prisma.orderItem.count({ where: { productId: id } });
  if (soldCount > 0) throw hasSales;

  try {
    // Its stock row and stock history are removed with it
    await prisma.product.delete({ where: { id } });
  } catch (err) {
    if (isForeignKeyViolation(err)) throw hasSales;
    throw err;
  }

  await deleteUploadedImage(existing.imageUrl);

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "PRODUCT_DELETED",
      entity: "product",
      entityId: id,
      details: { name: existing.name, sku: existing.sku },
    },
    ctx
  );
}
