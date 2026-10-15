import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, cleanupAll, createShop, makeCategory, makeProduct, placeOrder, prisma, uuid, type TestShop } from "./helpers";

afterAll(cleanupAll);

describe("categories", () => {
  let shop: TestShop;
  let other: TestShop;
  beforeAll(async () => {
    shop = await createShop("categories");
    other = await createShop("categories-other");
  });
  const owner = () => api(shop.owner.token);

  it("creates, lists, renames and disables a category", async () => {
    const created = await owner().post("/categories", { name: "Hot Drinks", imageUrl: null, isActive: true });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ name: "Hot Drinks", isActive: true, productCount: 0 });
    const id = created.body.data.id;

    const list = await owner().get("/categories");
    expect(list.body.data.map((c: { name: string }) => c.name)).toContain("Hot Drinks");

    const renamed = await owner().put(`/categories/${id}`, { name: "Hot Beverages", imageUrl: null, isActive: true });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe("Hot Beverages");

    const disabled = await owner().put(`/categories/${id}`, { name: "Hot Beverages", imageUrl: null, isActive: false });
    expect(disabled.body.data.isActive).toBe(false);
  });

  it("does not allow two categories with the same name, in any letter case", async () => {
    await owner().post("/categories", { name: "Snacks", imageUrl: null, isActive: true });
    const same = await owner().post("/categories", { name: "snacks", imageUrl: null, isActive: true });
    expect(same.status).toBe(409);
    expect(same.body.error.code).toBe("CATEGORY_EXISTS");

    const desserts = await owner().post("/categories", { name: "Desserts", imageUrl: null, isActive: true });
    const clash = await owner().put(`/categories/${desserts.body.data.id}`, { name: "SNACKS", imageUrl: null, isActive: true });
    expect(clash.status).toBe(409);
  });

  it("validates the name", async () => {
    const res = await owner().post("/categories", { name: "A", imageUrl: null, isActive: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("cannot be deleted while it has products, unless they are moved", async () => {
    const from = await makeCategory(shop.id, "Move From");
    const to = await makeCategory(shop.id, "Move To");
    const product = await makeProduct(shop.id, from.id);

    const blocked = await owner().del(`/categories/${from.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CATEGORY_IN_USE");
    expect(blocked.body.error.message).toContain("1 product");

    expect((await owner().del(`/categories/${from.id}?reassignTo=${from.id}`)).body.error.code).toBe("INVALID_CATEGORY");

    const foreign = await makeCategory(other.id, "Foreign");
    expect((await owner().del(`/categories/${from.id}?reassignTo=${foreign.id}`)).body.error.code).toBe("INVALID_CATEGORY");

    const moved = await owner().del(`/categories/${from.id}?reassignTo=${to.id}`);
    expect(moved.status).toBe(200);
    expect(moved.body.data.movedProducts).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.categoryId).toBe(to.id);
    expect(await prisma.category.count({ where: { id: from.id } })).toBe(0);
  });

  it("an empty category can be deleted", async () => {
    const empty = await makeCategory(shop.id, "Empty One");
    const res = await owner().del(`/categories/${empty.id}`);
    expect(res.status).toBe(200);
    expect(await prisma.category.count({ where: { id: empty.id } })).toBe(0);
  });

  it("a cashier can look but not change, and another cafe cannot touch it", async () => {
    const cat = await makeCategory(shop.id, "Guarded");
    const cashier = api(shop.cashier.token);
    expect((await cashier.get("/categories")).status).toBe(200);
    expect((await cashier.post("/categories", { name: "Nope", imageUrl: null, isActive: true })).status).toBe(403);
    expect((await cashier.put(`/categories/${cat.id}`, { name: "Nope", imageUrl: null, isActive: true })).status).toBe(403);
    expect((await cashier.del(`/categories/${cat.id}`)).status).toBe(403);

    const intruder = api(other.owner.token);
    const put = await intruder.put(`/categories/${cat.id}`, { name: "Hacked", imageUrl: null, isActive: false });
    expect(put.status).toBe(404);
    expect(put.body.error.code).toBe("CATEGORY_NOT_FOUND");
    expect((await intruder.del(`/categories/${cat.id}`)).status).toBe(404);
  });
});

describe("products", () => {
  let shop: TestShop;
  let other: TestShop;
  let categoryId: string;
  beforeAll(async () => {
    shop = await createShop("products");
    other = await createShop("products-other");
    categoryId = (await makeCategory(shop.id, "Coffee")).id;
  });
  const owner = () => api(shop.owner.token);

  const valid = () => ({
    name: "Cappuccino",
    sku: "cap-001",
    categoryId,
    description: "",
    sellingPrice: "150",
    costPrice: "45.50",
    gstPercent: "5",
    prepTimeMin: 5,
    minStock: 10,
    stockQuantity: 60,
    isAvailable: true,
  });

  it("creates a product, works out the profit, and records the opening stock", async () => {
    const res = await owner().post("/products", valid());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: "Cappuccino",
      sku: "CAP-001", // the code is saved in capitals
      sellingPrice: "150.00",
      costPrice: "45.50",
      profit: "104.50",
      gstPercent: "5.00",
      stock: { quantity: 60, minStock: 10, status: "ok" },
    });

    const history = await prisma.inventoryTransaction.findMany({ where: { productId: res.body.data.id } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ type: "IN", quantityChange: 60, reason: "Opening stock" });
    expect(await prisma.auditLog.count({ where: { shopId: shop.id, action: "PRODUCT_CREATED" } })).toBeGreaterThanOrEqual(1);
  });

  it("makes no stock record for a product that starts with none", async () => {
    const res = await owner().post("/products", { ...valid(), sku: "ZERO-1", name: "Zero Stock", stockQuantity: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.stock).toMatchObject({ quantity: 0, status: "out" });
    expect(await prisma.inventoryTransaction.count({ where: { productId: res.body.data.id } })).toBe(0);
  });

  it("refuses a product code that is already used (in any letter case)", async () => {
    const res = await owner().post("/products", { ...valid(), name: "Another" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("SKU_TAKEN");
  });

  it("creates a code when none is given", async () => {
    const res = await owner().post("/products", { ...valid(), sku: "", name: "No Code Latte" });
    expect(res.status).toBe(201);
    expect(res.body.data.sku).toMatch(/^P-[A-Z0-9]{6}$/);
  });

  it("refuses bad values", async () => {
    const bad: Array<Record<string, unknown>> = [
      { sellingPrice: "-5" },
      { sellingPrice: "0" },
      { sellingPrice: "abc" },
      { sellingPrice: "1.234" },
      { sellingPrice: "99999999" },
      { costPrice: "-1" },
      { gstPercent: "101" },
      { gstPercent: "-1" },
      { minStock: -1 },
      { minStock: 1.5 },
      { stockQuantity: -1 },
      { name: "A" },
      { categoryId: "nope" },
      { sku: "bad sku!" },
    ];
    for (const change of bad) {
      const res = await owner().post("/products", { ...valid(), sku: `V-${uuid().slice(0, 6)}`, ...change });
      expect(res.status, JSON.stringify(change)).toBe(400);
      expect(res.body.error.code, JSON.stringify(change)).toBe("VALIDATION_ERROR");
    }
  });

  it("refuses a category from another cafe", async () => {
    const foreign = await makeCategory(other.id, "Foreign");
    const res = await owner().post("/products", { ...valid(), sku: "FOREIGN-1", categoryId: foreign.id });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_CATEGORY");
  });

  it("hides cost price and profit from a cashier", async () => {
    const list = await api(shop.cashier.token).get("/products?q=cappuccino");
    expect(list.status).toBe(200);
    expect(list.body.data.items[0]).toMatchObject({ name: "Cappuccino", costPrice: null, profit: null, sellingPrice: "150.00" });
    const seen = await owner().get("/products?q=cappuccino");
    expect(seen.body.data.items[0]).toMatchObject({ costPrice: "45.50", profit: "104.50" });
  });

  it("updates a product, but never changes the stock through the edit form", async () => {
    const created = await owner().post("/products", { ...valid(), sku: "UPD-1", name: "To Update", stockQuantity: 30 });
    const id = created.body.data.id;

    const res = await owner().put(`/products/${id}`, {
      ...valid(),
      sku: "UPD-1",
      name: "Updated Name",
      sellingPrice: "175.50",
      costPrice: "60",
      minStock: 4,
      stockQuantity: 5, // ignored
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: "Updated Name", sellingPrice: "175.50", profit: "115.50", stock: { quantity: 30, minStock: 4 } });

    const clash = await owner().put(`/products/${id}`, { ...valid(), sku: "CAP-001", name: "Updated Name" });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("SKU_TAKEN");
  });

  it("turns a product off and on, and a product that is off disappears from the order screen", async () => {
    const created = await owner().post("/products", { ...valid(), sku: "TOG-1", name: "Toggle Me" });
    const id = created.body.data.id;

    const off = await owner().patch(`/products/${id}/availability`, { isAvailable: false });
    expect(off.body.data.isAvailable).toBe(false);
    const hidden = await api(shop.cashier.token).get("/pos/catalog");
    expect(hidden.body.data.products.map((p: { id: string }) => p.id)).not.toContain(id);

    await owner().patch(`/products/${id}/availability`, { isAvailable: true });
    const shown = await api(shop.cashier.token).get("/pos/catalog");
    expect(shown.body.data.products.map((p: { id: string }) => p.id)).toContain(id);
  });

  it("can delete a product that was never sold, but not one that was", async () => {
    const unused = await owner().post("/products", { ...valid(), sku: "DEL-1", name: "Never Sold" });
    const gone = await owner().del(`/products/${unused.body.data.id}`);
    expect(gone.status).toBe(200);
    expect((await owner().get(`/products/${unused.body.data.id}`)).body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(await prisma.inventory.count({ where: { productId: unused.body.data.id } })).toBe(0);

    const sold = await owner().post("/products", { ...valid(), sku: "DEL-2", name: "Was Sold" });
    await placeOrder(shop.cashier.token, { items: [{ productId: sold.body.data.id, quantity: 1 }] });
    const blocked = await owner().del(`/products/${sold.body.data.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("PRODUCT_HAS_SALES");
    expect(await prisma.product.count({ where: { id: sold.body.data.id } })).toBe(1);
  });

  it("only the owner and managers can change the menu", async () => {
    const cashier = api(shop.cashier.token);
    expect((await cashier.post("/products", { ...valid(), sku: "NOPE-1" })).status).toBe(403);
    const any = (await owner().get("/products?q=cappuccino")).body.data.items[0].id;
    expect((await cashier.put(`/products/${any}`, valid())).status).toBe(403);
    expect((await cashier.patch(`/products/${any}/availability`, { isAvailable: false })).status).toBe(403);
    expect((await cashier.del(`/products/${any}`)).status).toBe(403);
    expect((await api(shop.manager.token).post("/products", { ...valid(), sku: "MGR-1", name: "Manager Made" })).status).toBe(201);
  });

  it("another cafe cannot see or change it", async () => {
    const id = (await owner().get("/products?q=cappuccino")).body.data.items[0].id;
    const intruder = api(other.owner.token);
    expect((await intruder.get(`/products/${id}`)).status).toBe(404);
    expect((await intruder.put(`/products/${id}`, { ...valid(), categoryId: (await makeCategory(other.id)).id })).status).toBe(404);
    expect((await intruder.del(`/products/${id}`)).status).toBe(404);
    const list = await intruder.get("/products");
    expect(list.body.data.total).toBe(0);
  });
});

describe("searching and filtering products", () => {
  let shop: TestShop;
  let teaId: string;
  let cakeId: string;
  beforeAll(async () => {
    shop = await createShop("filters");
    const tea = await makeCategory(shop.id, "Tea");
    const cake = await makeCategory(shop.id, "Cakes");
    teaId = tea.id;
    cakeId = cake.id;
    await makeProduct(shop.id, tea.id, { name: "Alpha Tea", sku: "ZZ-99", stock: 50, minStock: 5 });
    await makeProduct(shop.id, tea.id, { name: "Beta Tea", stock: 3, minStock: 5 }); // low
    await makeProduct(shop.id, cake.id, { name: "Gamma Cake", stock: 0, minStock: 5 }); // out
    await makeProduct(shop.id, cake.id, { name: "Delta Cake", stock: 100, available: false }); // disabled
  });
  const names = (res: { body: { data: { items: Array<{ name: string }> } } }) => res.body.data.items.map((i) => i.name);
  const owner = () => api(shop.owner.token);

  it("lists everything by name", async () => {
    const res = await owner().get("/products");
    expect(names(res)).toEqual(["Alpha Tea", "Beta Tea", "Delta Cake", "Gamma Cake"]);
    expect(res.body.data.total).toBe(4);
  });

  it("searches by name or code, in any letter case", async () => {
    expect(names(await owner().get("/products?q=TEA"))).toEqual(["Alpha Tea", "Beta Tea"]);
    expect(names(await owner().get("/products?q=zz-99"))).toEqual(["Alpha Tea"]);
    expect(names(await owner().get("/products?q=%25"))).toEqual([]); // a percent sign is just a character
  });

  it("filters by category, availability and stock level", async () => {
    expect(names(await owner().get(`/products?categoryId=${cakeId}`))).toEqual(["Delta Cake", "Gamma Cake"]);
    expect(names(await owner().get(`/products?categoryId=${teaId}`))).toEqual(["Alpha Tea", "Beta Tea"]);
    expect(names(await owner().get("/products?status=inactive"))).toEqual(["Delta Cake"]);
    expect(names(await owner().get("/products?status=active"))).toEqual(["Alpha Tea", "Beta Tea", "Gamma Cake"]);
    expect(names(await owner().get("/products?stock=low"))).toEqual(["Beta Tea"]);
    expect(names(await owner().get("/products?stock=out"))).toEqual(["Gamma Cake"]);
  });

  it("splits long lists into pages, and refuses silly page sizes", async () => {
    const first = await owner().get("/products?pageSize=2&page=1");
    expect(first.body.data).toMatchObject({ total: 4, totalPages: 2, page: 1 });
    expect(names(first)).toEqual(["Alpha Tea", "Beta Tea"]);
    expect(names(await owner().get("/products?pageSize=2&page=2"))).toEqual(["Delta Cake", "Gamma Cake"]);
    expect((await owner().get("/products?pageSize=1000")).status).toBe(400);
    expect((await owner().get("/products?page=0")).status).toBe(400);
  });
});
