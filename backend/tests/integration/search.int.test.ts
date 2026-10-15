import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, cleanupAll, createShop, makeCategory, makeProduct, payOrder, phone, placeOrder, today, uuid, type TestShop } from "./helpers";

afterAll(cleanupAll);

// In a database search, % _ and \ are wildcards. A search box must treat them as ordinary characters.
// Each one is checked with a name that really contains it, and a look-alike that must NOT match.
const q = (text: string) => `q=${encodeURIComponent(text)}`;
const sorted = (list: Array<string | null>) => [...list].sort();

describe("searching treats % _ and \\ as plain characters", () => {
  let shop: TestShop;
  let plain: { id: string };

  beforeAll(async () => {
    shop = await createShop("search");
    const cat = await makeCategory(shop.id, "Search Menu");
    await makeProduct(shop.id, cat.id, { name: "100% Juice", sku: "J-PCT" });
    plain = await makeProduct(shop.id, cat.id, { name: "Plain Juice", sku: "J-PLAIN" });
    await makeProduct(shop.id, cat.id, { name: "A_B Item", sku: "AB-UND" });
    await makeProduct(shop.id, cat.id, { name: "AxB Item", sku: "AB-X" });
    await makeProduct(shop.id, cat.id, { name: "Back\\Slash Item", sku: "BS-1" });
  });

  const names = (res: { body: { data: { items: Array<{ name: string }> } } }) => sorted(res.body.data.items.map((i) => i.name));

  it("products", async () => {
    const owner = api(shop.owner.token);
    expect(names(await owner.get(`/products?${q("%")}`))).toEqual(["100% Juice"]);
    expect(names(await owner.get(`/products?${q("100%")}`))).toEqual(["100% Juice"]);
    expect(names(await owner.get(`/products?${q("_")}`))).toEqual(["A_B Item"]);
    expect(names(await owner.get(`/products?${q("a_b")}`))).toEqual(["A_B Item"]); // not "AxB Item"
    expect(names(await owner.get(`/products?${q("\\")}`))).toEqual(["Back\\Slash Item"]);
    expect(names(await owner.get(`/products?${q("juice")}`))).toEqual(["100% Juice", "Plain Juice"]); // ordinary search still works
  });

  it("the inventory list", async () => {
    const manager = api(shop.manager.token);
    expect(names(await manager.get(`/inventory?${q("%")}`))).toEqual(["100% Juice"]);
    expect(names(await manager.get(`/inventory?${q("a_b")}`))).toEqual(["A_B Item"]);
    expect(names(await manager.get(`/inventory?${q("\\")}`))).toEqual(["Back\\Slash Item"]);
  });

  it("orders (by customer name)", async () => {
    for (const customerName of ["100% Happy", "Plain Customer", "a_b buyer", "axb buyer"]) {
      await placeOrder(shop.cashier.token, { items: [{ productId: plain.id, quantity: 1 }], customerName });
    }
    const range = `from=${today()}&to=${today()}`;
    const customers = async (text: string) =>
      sorted(
        (await api(shop.cashier.token).get(`/orders?${q(text)}&${range}`)).body.data.items.map(
          (o: { customerName: string | null }) => o.customerName
        )
      );

    expect(await customers("%")).toEqual(["100% Happy"]);
    expect(await customers("a_b")).toEqual(["a_b buyer"]); // not "axb buyer"
    expect(await customers("customer")).toEqual(["Plain Customer"]);
  });

  it("payments and invoices", async () => {
    const order = await placeOrder(shop.cashier.token, {
      items: [{ productId: plain.id, quantity: 1 }],
      customerName: "Pay 100% Fan",
      customerPhone: phone(),
    });
    await payOrder(shop.cashier.token, order.id, "UPI");

    const payments = await api(shop.cashier.token).get(`/payments?${q("%")}`);
    expect(payments.body.data.items.map((p: { customerName: string }) => p.customerName)).toEqual(["Pay 100% Fan"]);
    const invoices = await api(shop.cashier.token).get(`/invoices?${q("%")}`);
    expect(invoices.body.data.total).toBe(1);
  });

  it("customers", async () => {
    const owner = api(shop.owner.token);
    await owner.post("/customers", { name: "100% Fan", phone: phone(), email: "", address: "" });
    await owner.post("/customers", { name: "Plain Fan", phone: phone(), email: "", address: "" });
    const res = await owner.get(`/customers?${q("%")}`);
    // "Pay 100% Fan" (made by the payments test above, from a phone number on an order) is a customer too
    expect(res.body.data.items.map((c: { name: string }) => c.name).sort()).toEqual(["100% Fan", "Pay 100% Fan"]);
    expect(JSON.stringify(res.body)).not.toContain("Plain Fan");
  });

  it("staff", async () => {
    const owner = api(shop.owner.token);
    const created = await owner.post("/staff", { name: "Crew 100% Star", phone: phone(), email: "", role: "CASHIER", joiningDate: today() });
    expect(created.status).toBe(201);
    const res = await owner.get(`/staff?${q("%")}`);
    expect(res.body.data.items.map((s: { name: string }) => s.name)).toEqual(["Crew 100% Star"]);
  });

  it("the stock history (by reason)", async () => {
    const manager = api(shop.manager.token);
    await manager.post("/inventory/adjust", { action: "IN", productId: plain.id, quantity: 1, reason: "Bonus 100% extra", idempotencyKey: uuid() });
    await manager.post("/inventory/adjust", { action: "IN", productId: plain.id, quantity: 1, reason: "Plain delivery", idempotencyKey: uuid() });

    const reasons = async (text: string) =>
      (await manager.get(`/inventory/history?${q(text)}`)).body.data.items.map((r: { reason: string }) => r.reason);
    expect(await reasons("%")).toEqual(["Bonus 100% extra"]);
    expect(await reasons("extra")).toEqual(["Bonus 100% extra"]);
  });
});
