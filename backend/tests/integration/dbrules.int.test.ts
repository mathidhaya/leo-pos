import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupAll, createShop, makeCategory, makeProduct, prisma, uuid, type TestShop } from "./helpers";

afterAll(cleanupAll);

describe("the database refuses bad data by itself", () => {
  let shop: TestShop;
  let other: TestShop;
  let category: { id: string };
  let product: { id: string };

  beforeAll(async () => {
    shop = await createShop("dbrules");
    other = await createShop("dbrules-other");
    category = await makeCategory(shop.id, "Rules");
    product = await makeProduct(shop.id, category.id, { stock: 10 });
  });

  const newProduct = (data: Record<string, unknown>) =>
    prisma.product.create({
      data: { shopId: shop.id, categoryId: category.id, name: "Rule Test", sku: `R-${uuid().slice(0, 8)}`, sellingPrice: "10.00", ...data } as never,
    });

  it("a product cannot have a negative price or a GST rate above 100", async () => {
    await expect(newProduct({ sellingPrice: "-1.00" })).rejects.toThrow();
    await expect(newProduct({ costPrice: "-0.01" })).rejects.toThrow();
    await expect(newProduct({ gstPercent: "101.00" })).rejects.toThrow();
    await expect(newProduct({ gstPercent: "-1.00" })).rejects.toThrow();
    await expect(newProduct({ gstPercent: "100.00" })).resolves.toBeTruthy();
  });

  it("stock cannot go below zero", async () => {
    await expect(prisma.inventory.update({ where: { productId: product.id }, data: { quantity: -1 } })).rejects.toThrow();
    await expect(prisma.inventory.update({ where: { productId: product.id }, data: { minStock: -1 } })).rejects.toThrow();
  });

  it("a stock movement must have the right direction", async () => {
    const move = (type: "IN" | "OUT" | "SALE" | "ADJUST", quantityChange: number) =>
      prisma.inventoryTransaction.create({ data: { productId: product.id, type, quantityChange } });

    await expect(move("IN", -5)).rejects.toThrow();
    await expect(move("OUT", 5)).rejects.toThrow();
    await expect(move("SALE", 5)).rejects.toThrow();
    await expect(move("IN", 0)).rejects.toThrow();
    await expect(move("ADJUST", 0)).rejects.toThrow();
    await expect(move("IN", 5)).resolves.toBeTruthy();
    await expect(move("OUT", -5)).resolves.toBeTruthy();
    await expect(move("ADJUST", -3)).resolves.toBeTruthy(); // a count can go either way
  });

  it("an order's total must equal subtotal - discount + GST + delivery", async () => {
    const make = (data: Record<string, unknown>, orderNo: number) =>
      prisma.order.create({
        data: { shopId: shop.id, orderNo, orderType: "TAKE_AWAY", createdById: shop.cashier.id, subtotal: "100.00", ...data } as never,
      });

    await expect(make({ tax: "5.00", grandTotal: "106.00" }, 9001)).rejects.toThrow();
    await expect(make({ tax: "5.00", grandTotal: "104.00" }, 9002)).rejects.toThrow();
    await expect(make({ discount: "10.00", tax: "4.50", deliveryCharge: "30.00", grandTotal: "124.50" }, 9003)).resolves.toBeTruthy();
    await expect(make({ subtotal: "-1.00", grandTotal: "-1.00" }, 9004)).rejects.toThrow();
  });

  it("a payment must add up: change = received - amount, and cash must cover the amount", async () => {
    const order = await prisma.order.create({
      data: { shopId: shop.id, orderNo: 9100, orderType: "TAKE_AWAY", createdById: shop.cashier.id, subtotal: "100.00", grandTotal: "100.00" },
    });
    const pay = (data: Record<string, unknown>) =>
      prisma.payment.create({
        data: { orderId: order.id, method: "CASH", amount: "100.00", idempotencyKey: uuid(), createdById: shop.cashier.id, ...data } as never,
      });

    await expect(pay({ amountReceived: "150.00", changeGiven: "10.00" })).rejects.toThrow(); // wrong change
    await expect(pay({ amountReceived: "50.00", changeGiven: "0.00" })).rejects.toThrow(); // short
    await expect(pay({ changeGiven: "5.00" })).rejects.toThrow(); // change with nothing received
    await expect(pay({ amount: "-1.00" })).rejects.toThrow();
    await expect(pay({ amountReceived: "150.00", changeGiven: "50.00" })).resolves.toBeTruthy();
  });

  it("a person needs a phone number or an email to log in with", async () => {
    await expect(prisma.user.create({ data: { shopId: shop.id, name: "No Login", passwordHash: "x", role: "CASHIER" } })).rejects.toThrow();
  });

  it("product codes and customer phones are unique inside a cafe, but may repeat in another", async () => {
    const sku = `U-${uuid().slice(0, 8)}`;
    await prisma.product.create({ data: { shopId: shop.id, categoryId: category.id, name: "One", sku, sellingPrice: "1.00" } });
    await expect(prisma.product.create({ data: { shopId: shop.id, categoryId: category.id, name: "Two", sku, sellingPrice: "1.00" } })).rejects.toThrow();

    const otherCategory = await makeCategory(other.id, "Other Rules");
    await expect(prisma.product.create({ data: { shopId: other.id, categoryId: otherCategory.id, name: "Three", sku, sellingPrice: "1.00" } })).resolves.toBeTruthy();

    await prisma.customer.create({ data: { shopId: shop.id, name: "A", phone: "9000000001" } });
    await expect(prisma.customer.create({ data: { shopId: shop.id, name: "B", phone: "9000000001" } })).rejects.toThrow();
    await expect(prisma.customer.create({ data: { shopId: other.id, name: "C", phone: "9000000001" } })).resolves.toBeTruthy();
  });

  it("a sold product, and a category with products, cannot be deleted", async () => {
    const order = await prisma.order.create({
      data: { shopId: shop.id, orderNo: 9200, orderType: "TAKE_AWAY", createdById: shop.cashier.id, subtotal: "10.00", grandTotal: "10.00" },
    });
    await prisma.orderItem.create({
      data: { orderId: order.id, productId: product.id, nameSnapshot: "X", unitPrice: "10.00", costPrice: "4.00", gstPercent: "0.00", quantity: 1, taxAmount: "0.00", lineTotal: "10.00" },
    });
    await expect(prisma.product.delete({ where: { id: product.id } })).rejects.toThrow();
    await expect(prisma.category.delete({ where: { id: category.id } })).rejects.toThrow();
    await expect(
      prisma.orderItem.create({
        data: { orderId: order.id, productId: product.id, nameSnapshot: "X", unitPrice: "10.00", costPrice: "4.00", gstPercent: "0.00", quantity: 0, taxAmount: "0.00", lineTotal: "0.00" },
      })
    ).rejects.toThrow(); // a quantity of zero
  });

  it("the default GST in Settings must be between 0 and 100", async () => {
    await expect(prisma.settings.update({ where: { shopId: shop.id }, data: { defaultGst: "150.00" } })).rejects.toThrow();
    await expect(prisma.settings.update({ where: { shopId: shop.id }, data: { defaultGst: "12.50" } })).resolves.toBeTruthy();
  });
});
