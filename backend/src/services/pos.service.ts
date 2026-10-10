import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import { AppError } from "../utils/AppError";
import {
  MAX_DELIVERY_CHARGE_PAISE,
  calculateBill,
  paiseToDecimalString,
  parseMoneyToPaise,
  parsePercentToBasisPoints,
  type DiscountInput,
} from "../utils/billing";
import type { QuoteInput } from "../validators/pos.validators";

export type OrderRequest = Pick<QuoteInput, "items" | "discount" | "orderType" | "deliveryCharge">;

// The order screen only needs what is for sale. Cost price is never sent.
export async function getCatalog(shopId: string) {
  const [categories, products] = await Promise.all([
    prisma.category.findMany({
      where: { shopId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, imageUrl: true },
    }),
    prisma.product.findMany({
      where: { shopId, isAvailable: true, category: { isActive: true } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 1000,
      include: { inventory: { select: { quantity: true, minStock: true } } },
    }),
  ]);

  return {
    categories,
    products: products.map((product) => {
      const quantity = product.inventory?.quantity ?? 0;
      const minStock = product.inventory?.minStock ?? 0;
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        imageUrl: product.imageUrl,
        categoryId: product.categoryId,
        sellingPrice: product.sellingPrice.toFixed(2),
        gstPercent: product.gstPercent.toFixed(2),
        prepTimeMin: product.prepTimeMin,
        stock: {
          quantity,
          minStock,
          status: quantity === 0 ? "out" : quantity <= minStock ? "low" : "ok",
        },
      };
    }),
  };
}

function toDiscountInput(discount: OrderRequest["discount"]): DiscountInput {
  if (discount.type === "none") return { type: "none" };

  if (discount.type === "percent") {
    const basisPoints = parsePercentToBasisPoints(discount.value);
    if (basisPoints === null) {
      throw new AppError(400, "INVALID_DISCOUNT", "Enter a discount percentage from 0 to 100.");
    }
    return { type: "percent", basisPoints };
  }

  const paise = parseMoneyToPaise(discount.value);
  if (paise === null) {
    throw new AppError(400, "INVALID_DISCOUNT", "Enter a valid discount amount, for example 50 or 50.50.");
  }
  return { type: "amount", paise };
}

function toDeliveryPaise(input: OrderRequest): number {
  if (input.orderType !== "DELIVERY" || !input.deliveryCharge) return 0;
  const paise = parseMoneyToPaise(input.deliveryCharge);
  if (paise === null || paise > MAX_DELIVERY_CHARGE_PAISE) {
    throw new AppError(400, "INVALID_DELIVERY_CHARGE", "Enter a valid delivery charge (up to 10,000).");
  }
  return paise;
}

// Loads the real products, checks they can be sold, and calculates the bill.
// Prices and GST come from the database, never from the browser.
// Used by both the quote and the real order, so they can never disagree.
export async function prepareOrder(db: Pick<Prisma.TransactionClient, "product">, shopId: string, input: OrderRequest) {
  // The same product listed twice counts as one line
  const wanted = new Map<string, number>();
  for (const item of input.items) {
    wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.quantity);
  }

  const products = await db.product.findMany({
    where: { shopId, id: { in: [...wanted.keys()] } },
    include: {
      category: { select: { isActive: true } },
      inventory: { select: { quantity: true } },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));

  const problems = new Set<string>();
  for (const [id, quantity] of wanted) {
    const product = byId.get(id);
    if (!product) {
      problems.add("An item in this order no longer exists.");
      continue;
    }
    if (!product.isAvailable || !product.category.isActive) {
      problems.add(`"${product.name}" is not available right now.`);
      continue;
    }
    const inStock = product.inventory?.quantity ?? 0;
    if (quantity > inStock) {
      problems.add(inStock === 0 ? `"${product.name}" is out of stock.` : `Only ${inStock} of "${product.name}" left in stock.`);
    }
  }
  if (problems.size > 0) {
    throw new AppError(422, "CART_UNAVAILABLE", [...problems].join(" "));
  }

  const ordered = [...wanted.keys()].map((id) => byId.get(id)!);

  const result = calculateBill({
    lines: ordered.map((product) => ({
      key: product.id,
      unitPricePaise: parseMoneyToPaise(product.sellingPrice.toFixed(2)) ?? -1,
      quantity: wanted.get(product.id)!,
      gstBasisPoints: parsePercentToBasisPoints(product.gstPercent.toFixed(2)) ?? -1,
    })),
    discount: toDiscountInput(input.discount),
    deliveryChargePaise: toDeliveryPaise(input),
  });

  if (!result.ok) throw new AppError(400, "INVALID_BILL", result.error);

  return { ordered, wanted, bill: result.bill };
}

// The server's own check of a bill, before anything is saved.
export async function quoteOrder(user: { shopId: string }, input: QuoteInput) {
  const { ordered, wanted, bill } = await prepareOrder(prisma, user.shopId, input);

  return {
    orderType: input.orderType,
    lines: bill.lines.map((billLine, index) => {
      const product = ordered[index];
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        quantity: wanted.get(product.id)!,
        unitPrice: product.sellingPrice.toFixed(2),
        gstPercent: product.gstPercent.toFixed(2),
        discount: paiseToDecimalString(billLine.discountPaise),
        taxable: paiseToDecimalString(billLine.taxablePaise),
        tax: paiseToDecimalString(billLine.taxPaise),
        total: paiseToDecimalString(billLine.totalPaise),
      };
    }),
    subtotal: paiseToDecimalString(bill.subtotalPaise),
    discount: paiseToDecimalString(bill.discountPaise),
    tax: paiseToDecimalString(bill.taxPaise),
    deliveryCharge: paiseToDecimalString(bill.deliveryChargePaise),
    grandTotal: paiseToDecimalString(bill.grandTotalPaise),
  };
}
