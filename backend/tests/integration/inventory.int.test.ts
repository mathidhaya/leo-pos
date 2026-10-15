import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, cleanupAll, createShop, makeCategory, makeProduct, placeOrder, prisma, sortedStatuses, stockOf, uuid, type TestShop } from "./helpers";

afterAll(cleanupAll);

describe("inventory", () => {
  let shop: TestShop;
  let other: TestShop;
  let cat: { id: string };
  const manager = () => api(shop.manager.token);

  beforeAll(async () => {
    shop = await createShop("inventory");
    other = await createShop("inventory-other");
    cat = await makeCategory(shop.id, "Menu");
  });

  const adjust = (body: Record<string, unknown>, token = shop.manager.token) =>
    api(token).post("/inventory/adjust", { idempotencyKey: uuid(), ...body });

  it("stock in adds, stock out removes (with a reason), and both are in the history", async () => {
    const p = await makeProduct(shop.id, cat.id, { name: "Ledger Item", stock: 10 });

    const added = await adjust({ action: "IN", productId: p.id, quantity: 5, reason: "Supplier delivery" });
    expect(added.status).toBe(201);
    expect(added.body.data.quantity).toBe(15);

    const noReason = await adjust({ action: "OUT", productId: p.id, quantity: 2 });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.code).toBe("VALIDATION_ERROR");

    const removed = await adjust({ action: "OUT", productId: p.id, quantity: 4, reason: "Wastage" });
    expect(removed.body.data.quantity).toBe(11);

    const history = await manager().get(`/inventory/history?productId=${p.id}`);
    const rows = history.body.data.items.map((r: { type: string; quantityChange: number; reason: string }) => [r.type, r.quantityChange, r.reason]);
    expect(rows).toEqual([
      ["OUT", -4, "Wastage"],
      ["IN", 5, "Supplier delivery"],
    ]);
    expect(history.body.data.items[0].by).toBe(shop.manager.name);
  });

  it("never goes below zero, and never above the maximum", async () => {
    const p = await makeProduct(shop.id, cat.id, { stock: 3 });
    const tooMany = await adjust({ action: "OUT", productId: p.id, quantity: 4, reason: "Wastage" });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(p.id)).toBe(3);

    const huge = await makeProduct(shop.id, cat.id, { stock: 999_999 });
    const over = await adjust({ action: "IN", productId: huge.id, quantity: 5 });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("STOCK_TOO_LARGE");
  });

  it("a count sets the exact number, but refuses if the stock moved while counting", async () => {
    const p = await makeProduct(shop.id, cat.id, { stock: 20 });

    const counted = await adjust({ action: "ADJUST", productId: p.id, newQuantity: 15, expectedQuantity: 20, reason: "Stock count" });
    expect(counted.status).toBe(201);
    expect(counted.body.data.quantity).toBe(15);
    expect((await prisma.inventoryTransaction.findFirst({ where: { productId: p.id, type: "ADJUST" } }))!.quantityChange).toBe(-5);

    const stale = await adjust({ action: "ADJUST", productId: p.id, newQuantity: 18, expectedQuantity: 20, reason: "Stock count" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STOCK_CHANGED");

    const same = await adjust({ action: "ADJUST", productId: p.id, newQuantity: 15, expectedQuantity: 15, reason: "Stock count" });
    expect(same.status).toBe(422);
    expect(same.body.error.code).toBe("NO_CHANGE");
    expect(await stockOf(p.id)).toBe(15);
  });

  it("the same request twice changes the stock once", async () => {
    const p = await makeProduct(shop.id, cat.id, { stock: 10 });
    const body = { action: "IN", productId: p.id, quantity: 5, idempotencyKey: uuid() };

    expect((await api(shop.manager.token).post("/inventory/adjust", body)).status).toBe(201);
    expect((await api(shop.manager.token).post("/inventory/adjust", body)).status).toBe(200);
    expect(await stockOf(p.id)).toBe(15);

    const q = await makeProduct(shop.id, cat.id, { stock: 10 });
    const borrowed = await api(shop.manager.token).post("/inventory/adjust", { ...body, productId: q.id });
    expect(borrowed.status).toBe(409);
    expect(borrowed.body.error.code).toBe("KEY_REUSED");
  });

  it("two stock removals at once cannot take more than there is", async () => {
    const p = await makeProduct(shop.id, cat.id, { stock: 10 });
    const results = await Promise.all([
      adjust({ action: "OUT", productId: p.id, quantity: 6, reason: "Wastage" }),
      adjust({ action: "OUT", productId: p.id, quantity: 6, reason: "Damaged" }, shop.owner.token),
    ]);
    expect(sortedStatuses(results)).toEqual([201, 422]);
    expect(results.find((r) => r.status === 422)!.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await stockOf(p.id)).toBe(4);
  });

  it("two identical requests at once change the stock once", async () => {
    const p = await makeProduct(shop.id, cat.id, { stock: 10 });
    const body = { action: "IN", productId: p.id, quantity: 5, idempotencyKey: uuid() };
    const results = await Promise.all([api(shop.manager.token).post("/inventory/adjust", body), api(shop.manager.token).post("/inventory/adjust", body)]);
    expect(sortedStatuses(results)).toEqual([200, 201]);
    expect(await stockOf(p.id)).toBe(15);
    expect(await prisma.inventoryTransaction.count({ where: { productId: p.id } })).toBe(1);
  });

  it("sales appear in the history, and the low-stock alerts follow the minimum", async () => {
    const s = await createShop("inventory-alerts");
    const c = await makeCategory(s.id, "Menu");
    const ok = await makeProduct(s.id, c.id, { name: "Plenty Left", stock: 50, minStock: 5 });
    const low = await makeProduct(s.id, c.id, { name: "Running Low", stock: 3, minStock: 5 });
    const out = await makeProduct(s.id, c.id, { name: "Gone", stock: 0, minStock: 5 });
    await makeProduct(s.id, c.id, { name: "Switched Off", stock: 0, available: false });

    const res = await api(s.manager.token).get("/inventory");
    expect(res.body.data.summary).toEqual({ activeProducts: 3, low: 1, outOfStock: 1 });
    expect(res.body.data.alerts.map((a: { name: string }) => a.name)).toEqual(["Gone", "Running Low"]); // out of stock first
    expect((await api(s.manager.token).get("/inventory?stock=low")).body.data.items.map((i: { name: string }) => i.name)).toEqual(["Running Low"]);
    expect((await api(s.manager.token).get("/inventory?stock=out")).body.data.items.map((i: { name: string }) => i.name)).toEqual(["Gone", "Switched Off"]);
    // The list shows disabled products too (marked "Disabled"). Only the cards and the alerts count what is for sale.

    const order = await placeOrder(s.cashier.token, { items: [{ productId: ok.id, quantity: 2 }] });
    const sale = (await api(s.manager.token).get(`/inventory/history?productId=${ok.id}&type=SALE`)).body.data.items[0];
    expect(sale).toMatchObject({ type: "SALE", quantityChange: -2, orderNo: order.orderNo });
    expect(low.id).toBeTruthy();
    expect(out.id).toBeTruthy();
  });

  it("only the owner and managers, and only for their own cafe", async () => {
    const p = await makeProduct(shop.id, cat.id, { stock: 5 });
    expect((await api(shop.cashier.token).get("/inventory")).status).toBe(403);
    expect((await adjust({ action: "IN", productId: p.id, quantity: 1 }, shop.cashier.token)).status).toBe(403);
    expect((await api(shop.owner.token).get("/inventory")).status).toBe(200);

    const intruder = await adjust({ action: "IN", productId: p.id, quantity: 1 }, other.owner.token);
    expect(intruder.status).toBe(404);
    expect(intruder.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(await stockOf(p.id)).toBe(5);
    expect((await api(other.owner.token).get("/inventory")).body.data.total).toBe(0);
  });
});
