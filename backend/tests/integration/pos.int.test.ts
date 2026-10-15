import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, cleanupAll, createShop, makeCategory, makeProduct, prisma, uuid, type TestShop } from "./helpers";

afterAll(cleanupAll);

describe("the order screen: pricing", () => {
  let shop: TestShop;
  let other: TestShop;
  let spec: { id: string }; // 250.00 with 18% GST: the example from the project spec
  let a: { id: string }; // 100.00 with 5% GST
  let b: { id: string }; // 200.00 with 18% GST
  let odd: { id: string }; // 10.50 with 5% GST: GST of 0.525 must round to 0.53

  beforeAll(async () => {
    shop = await createShop("pos");
    other = await createShop("pos-other");
    const cat = await makeCategory(shop.id, "Menu");
    spec = await makeProduct(shop.id, cat.id, { name: "Spec Item", price: "250.00", gst: "18.00" });
    a = await makeProduct(shop.id, cat.id, { name: "Item A", price: "100.00", gst: "5.00" });
    b = await makeProduct(shop.id, cat.id, { name: "Item B", price: "200.00", gst: "18.00" });
    odd = await makeProduct(shop.id, cat.id, { name: "Odd Price", price: "10.50", gst: "5.00" });
  });

  const quote = (body: unknown) => api(shop.cashier.token).post("/pos/quote", body);
  const base = { discount: { type: "none" }, orderType: "DINE_IN" };

  it("matches the project spec: 500 - 50 + 81 = 531", async () => {
    for (const discount of [{ type: "amount", value: "50" }, { type: "percent", value: "10" }]) {
      const res = await quote({ ...base, discount, items: [{ productId: spec.id, quantity: 2 }] });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ subtotal: "500.00", discount: "50.00", tax: "81.00", grandTotal: "531.00" });
      expect(res.body.data.lines[0]).toMatchObject({ discount: "50.00", taxable: "450.00", tax: "81.00", total: "531.00" });
    }
  });

  it("charges GST per product, each at its own rate", async () => {
    const res = await quote({ ...base, items: [{ productId: a.id, quantity: 1 }, { productId: b.id, quantity: 1 }] });
    expect(res.body.data).toMatchObject({ subtotal: "300.00", discount: "0.00", tax: "41.00", grandTotal: "341.00" });
    expect(res.body.data.lines.map((l: { tax: string }) => l.tax)).toEqual(["5.00", "36.00"]);
  });

  it("works out GST after the discount, not before", async () => {
    const res = await quote({ ...base, discount: { type: "percent", value: "10" }, items: [{ productId: a.id, quantity: 2 }] });
    expect(res.body.data).toMatchObject({ subtotal: "200.00", discount: "20.00", tax: "9.00", grandTotal: "189.00" });
  });

  it("rounds half a paisa up", async () => {
    const res = await quote({ ...base, items: [{ productId: odd.id, quantity: 1 }] });
    expect(res.body.data).toMatchObject({ subtotal: "10.50", tax: "0.53", grandTotal: "11.03" });
  });

  it("adds a delivery charge for delivery orders only, with no GST on it", async () => {
    const items = [{ productId: a.id, quantity: 1 }];
    const delivery = await quote({ ...base, orderType: "DELIVERY", deliveryCharge: "30", items });
    expect(delivery.body.data).toMatchObject({ deliveryCharge: "30.00", tax: "5.00", grandTotal: "135.00" });
    const takeAway = await quote({ ...base, orderType: "TAKE_AWAY", deliveryCharge: "30", items });
    expect(takeAway.body.data).toMatchObject({ deliveryCharge: "0.00", grandTotal: "105.00" });
  });

  it("combines the same product listed twice into one line", async () => {
    const res = await quote({ ...base, items: [{ productId: a.id, quantity: 1 }, { productId: a.id, quantity: 2 }] });
    expect(res.body.data.lines).toHaveLength(1);
    expect(res.body.data.lines[0].quantity).toBe(3);
    expect(res.body.data.grandTotal).toBe("315.00");
  });

  it("always uses the price in the database, never one sent by the browser", async () => {
    const cheat = await quote({ ...base, items: [{ productId: a.id, quantity: 1, unitPrice: "1.00", price: 1 }] });
    expect(cheat.body.data.grandTotal).toBe("105.00");

    await prisma.product.update({ where: { id: a.id }, data: { sellingPrice: "120.00" } });
    const after = await quote({ ...base, items: [{ productId: a.id, quantity: 1 }] });
    expect(after.body.data.grandTotal).toBe("126.00");
    await prisma.product.update({ where: { id: a.id }, data: { sellingPrice: "100.00" } });
  });

  it("refuses discounts that do not make sense", async () => {
    const items = [{ productId: spec.id, quantity: 2 }]; // subtotal 500
    const tooBig = await quote({ ...base, discount: { type: "amount", value: "600" }, items });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error.code).toBe("INVALID_BILL");

    for (const discount of [{ type: "percent", value: "101" }, { type: "amount", value: "abc" }, { type: "percent", value: "-5" }]) {
      const res = await quote({ ...base, discount, items });
      expect(res.status, JSON.stringify(discount)).toBe(400);
      expect(res.body.error.code, JSON.stringify(discount)).toBe("INVALID_DISCOUNT");
    }
    const delivery = await quote({ ...base, orderType: "DELIVERY", deliveryCharge: "abc", items });
    expect(delivery.body.error.code).toBe("INVALID_DELIVERY_CHARGE");
  });

  it("refuses bad quantities and empty orders", async () => {
    for (const items of [[], [{ productId: a.id, quantity: 0 }], [{ productId: a.id, quantity: 100 }], [{ productId: a.id, quantity: 1.5 }]]) {
      const res = await quote({ ...base, items });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("only cashiers and the owner can use the order screen", async () => {
    const items = [{ productId: a.id, quantity: 1 }];
    expect((await api(shop.owner.token).post("/pos/quote", { ...base, items })).status).toBe(200);
    expect((await api(shop.manager.token).post("/pos/quote", { ...base, items })).status).toBe(403);
    expect((await api(shop.manager.token).get("/pos/catalog")).status).toBe(403);
  });

  it("another cafe's product cannot be priced", async () => {
    const res = await api(other.cashier.token).post("/pos/quote", { ...base, items: [{ productId: a.id, quantity: 1 }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("CART_UNAVAILABLE");
  });
});

describe("the order screen: what can be sold", () => {
  let shop: TestShop;
  beforeAll(async () => {
    shop = await createShop("pos-stock");
  });
  const quote = (productId: string, quantity = 1) =>
    api(shop.cashier.token).post("/pos/quote", { discount: { type: "none" }, orderType: "DINE_IN", items: [{ productId, quantity }] });

  it("refuses out-of-stock, too-many, disabled, hidden-category and unknown products", async () => {
    const cat = await makeCategory(shop.id, "Open");
    const off = await makeCategory(shop.id, "Closed", false);
    const empty = await makeProduct(shop.id, cat.id, { stock: 0 });
    const few = await makeProduct(shop.id, cat.id, { name: "Few Left", stock: 3 });
    const disabled = await makeProduct(shop.id, cat.id, { available: false });
    const hidden = await makeProduct(shop.id, off.id);

    const outOfStock = await quote(empty.id);
    expect(outOfStock.status).toBe(422);
    expect(outOfStock.body.error.code).toBe("CART_UNAVAILABLE");
    expect(outOfStock.body.error.message).toContain("out of stock");

    expect((await quote(few.id, 4)).body.error.message).toContain('Only 3 of "Few Left"');
    expect((await quote(few.id, 3)).status).toBe(200);
    expect((await quote(disabled.id)).body.error.message).toContain("not available");
    expect((await quote(hidden.id)).body.error.message).toContain("not available");
    expect((await quote(uuid())).body.error.code).toBe("CART_UNAVAILABLE");
  });

  it("the order screen's menu shows stock levels but never cost prices, and hides what cannot be sold", async () => {
    const cat = await makeCategory(shop.id, "Menu Check");
    const off = await makeCategory(shop.id, "Menu Closed", false);
    const lowOne = await makeProduct(shop.id, cat.id, { name: "Low One", stock: 3, minStock: 5, cost: "77.77" });
    const outOne = await makeProduct(shop.id, cat.id, { name: "Out One", stock: 0 });
    const hiddenOne = await makeProduct(shop.id, off.id, { name: "Hidden One" });
    const disabledOne = await makeProduct(shop.id, cat.id, { name: "Disabled One", available: false });

    const res = await api(shop.cashier.token).get("/pos/catalog");
    expect(res.status).toBe(200);
    const byId = new Map<string, { stock: { status: string } }>(res.body.data.products.map((p: { id: string }) => [p.id, p]));

    expect(byId.get(lowOne.id)!.stock.status).toBe("low");
    expect(byId.get(outOne.id)!.stock.status).toBe("out"); // listed, but marked
    expect(byId.has(hiddenOne.id)).toBe(false);
    expect(byId.has(disabledOne.id)).toBe(false);
    expect(res.body.data.categories.map((c: { name: string }) => c.name)).not.toContain("Menu Closed");
    expect(JSON.stringify(res.body)).not.toMatch(/costPrice|77\.77/);
  });
});
