import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { isForeignKeyViolation, isUniqueViolation } from "../utils/prismaErrors";
import type { CategoryInput } from "../validators/catalog.validators";
import { logAudit, type RequestContext } from "./audit.service";
import { deleteUploadedImage } from "./upload.service";

type Actor = { id: string; shopId: string; role: RoleName };

interface CategoryRow {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
  _count: { products: number };
}

function toDto(category: CategoryRow) {
  return {
    id: category.id,
    name: category.name,
    imageUrl: category.imageUrl,
    isActive: category.isActive,
    productCount: category._count.products,
  };
}

const withCount = { _count: { select: { products: true } } } as const;

const notFound = () => new AppError(404, "CATEGORY_NOT_FOUND", "Category not found.");
const nameTaken = () => new AppError(409, "CATEGORY_EXISTS", "A category with this name already exists.");

// "coffee" and "Coffee" count as the same name
async function assertNameFree(shopId: string, name: string, exceptId?: string): Promise<void> {
  const clash = await prisma.category.findFirst({
    where: {
      shopId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw nameTaken();
}

export async function listCategories(shopId: string) {
  const rows = await prisma.category.findMany({
    where: { shopId },
    orderBy: { name: "asc" },
    include: withCount,
  });
  return rows.map(toDto);
}

export async function createCategory(user: Actor, input: CategoryInput, ctx: RequestContext) {
  await assertNameFree(user.shopId, input.name);

  try {
    const category = await prisma.category.create({
      data: {
        shopId: user.shopId,
        name: input.name,
        imageUrl: input.imageUrl ?? null,
        isActive: input.isActive,
      },
      include: withCount,
    });

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "CATEGORY_CREATED",
        entity: "category",
        entityId: category.id,
        details: { name: category.name },
      },
      ctx
    );
    return toDto(category);
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function updateCategory(user: Actor, id: string, input: CategoryInput, ctx: RequestContext) {
  const existing = await prisma.category.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true, imageUrl: true },
  });
  if (!existing) throw notFound();

  await assertNameFree(user.shopId, input.name, id);

  try {
    const category = await prisma.category.update({
      where: { id },
      data: {
        name: input.name,
        isActive: input.isActive,
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      },
      include: withCount,
    });

    if (input.imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== input.imageUrl) {
      await deleteUploadedImage(existing.imageUrl);
    }

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "CATEGORY_UPDATED",
        entity: "category",
        entityId: id,
        details: { name: category.name, isActive: category.isActive },
      },
      ctx
    );
    return toDto(category);
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

// A category with products can only be deleted if its products are moved to another category.
export async function deleteCategory(
  user: Actor,
  id: string,
  reassignTo: string | undefined,
  ctx: RequestContext
) {
  const category = await prisma.category.findFirst({
    where: { id, shopId: user.shopId },
    include: withCount,
  });
  if (!category) throw notFound();

  const productCount = category._count.products;

  if (productCount > 0) {
    if (!reassignTo) {
      throw new AppError(
        409,
        "CATEGORY_IN_USE",
        `"${category.name}" still has ${productCount} product${productCount === 1 ? "" : "s"}. Move them to another category before deleting it.`
      );
    }
    if (reassignTo === id) {
      throw new AppError(400, "INVALID_CATEGORY", "Choose a different category to move the products to.");
    }
    const target = await prisma.category.findFirst({
      where: { id: reassignTo, shopId: user.shopId },
      select: { id: true },
    });
    if (!target) {
      throw new AppError(400, "INVALID_CATEGORY", "Choose a valid category to move the products to.");
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (productCount > 0 && reassignTo) {
        await tx.product.updateMany({
          where: { categoryId: id, shopId: user.shopId },
          data: { categoryId: reassignTo },
        });
      }
      await tx.category.delete({ where: { id } });
    });
  } catch (err) {
    // A product was added to this category while we were deleting it
    if (isForeignKeyViolation(err)) {
      throw new AppError(409, "CATEGORY_IN_USE", "Products were just added to this category. Please try again.");
    }
    throw err;
  }

  await deleteUploadedImage(category.imageUrl);

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "CATEGORY_DELETED",
      entity: "category",
      entityId: id,
      details: { name: category.name, movedProducts: productCount },
    },
    ctx
  );

  return { movedProducts: productCount };
}
