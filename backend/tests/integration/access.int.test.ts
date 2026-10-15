import request from "supertest";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PASSWORD,
  api,
  app,
  cleanupAll,
  cookieOf,
  createShop,
  loginWith,
  makeCategory,
  makeProduct,
  payOrder,
  phone,
  placeOrder,
  prisma,
  refreshWith,
  today,
  uuid,
  type TestShop,
} from "./helpers";

afterAll(cleanupAll);

describe("staff management", () => {
  let shop: TestShop;
  let other: TestShop;
  const owner = () => api(shop.owner.token);
  const staffBody = (extra = {}) => ({ name: "New Staff", phone: phone(), email: "", role: "CASHIER", joiningDate: today(), ...extra });

  beforeAll(async () => {
    shop = await createShop("staff");
    other = await createShop("staff-other");
  });

  it("creates a person with a one-time password that is stored only as a hash, and they can log in", async () => {
    const body = staffBody();
    const res = await owner().post("/staff", body);
    expect(res.status).toBe(201);

    const secret = res.body.data.temporaryPassword as string;
    expect(secret).toHaveLength(12);
    expect(JSON.stringify(res.body.data.staff)).not.toMatch(/passwordHash|temporaryPassword/);

    const user = await prisma.user.findUnique({ where: { id: res.body.data.staff.id } });
    expect(user!.passwordHash).not.toContain(secret);
    expect(await bcrypt.compare(secret, user!.passwordHash)).toBe(true);

    const login = await loginWith(body.phone, secret);
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe("CASHIER");

    const list = await owner().get("/staff");
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|temporaryPassword/);
    expect(list.body.data.items[0].role).toBe("OWNER"); // the owner is always first
  });

  it("refuses duplicates, the owner role, and anyone who is not the owner", async () => {
    const taken = await owner().post("/staff", staffBody({ phone: shop.cashier.phone }));
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("PHONE_EXISTS");

    expect((await owner().post("/staff", staffBody({ role: "OWNER" }))).status).toBe(400);
    expect((await api(shop.manager.token).post("/staff", staffBody())).status).toBe(403);
    expect((await api(shop.cashier.token).get("/staff")).status).toBe(403);
  });

  it("disabling logs the person out at once, everywhere", async () => {
    const created = await owner().post("/staff", staffBody());
    const { id } = created.body.data.staff;
    const login = await loginWith(created.body.data.staff.phone, created.body.data.temporaryPassword);
    expect((await api(login.token).get("/auth/me")).status).toBe(200);

    expect((await owner().patch(`/staff/${id}/status`, { isActive: false })).body.data.isActive).toBe(false);

    expect((await api(login.token).get("/auth/me")).status).toBe(401); // the access token stops working immediately
    expect((await refreshWith(login.cookie)).status).toBe(401);
    const again = await loginWith(created.body.data.staff.phone, created.body.data.temporaryPassword);
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe("ACCOUNT_DISABLED");

    await owner().patch(`/staff/${id}/status`, { isActive: true });
    expect((await loginWith(created.body.data.staff.phone, created.body.data.temporaryPassword)).status).toBe(200);
  });

  it("a password reset makes the old password stop working", async () => {
    const created = await owner().post("/staff", staffBody());
    const { id, phone: mobile } = created.body.data.staff;
    const oldPassword = created.body.data.temporaryPassword;

    const reset = await owner().post(`/staff/${id}/reset-password`);
    expect(reset.status).toBe(200);
    expect(reset.body.data.temporaryPassword).not.toBe(oldPassword);
    expect((await loginWith(mobile, oldPassword)).status).toBe(401);
    expect((await loginWith(mobile, reset.body.data.temporaryPassword)).status).toBe(200);
  });

  it("a role change takes effect straight away, from the database, not from the token", async () => {
    const created = await owner().post("/staff", staffBody());
    const { id, phone: mobile } = created.body.data.staff;
    const login = await loginWith(mobile, created.body.data.temporaryPassword);
    expect((await api(login.token).get("/inventory")).status).toBe(403); // a cashier

    const changed = await owner().put(`/staff/${id}`, staffBody({ phone: mobile, role: "MANAGER" }));
    expect(changed.status).toBe(200);
    expect(changed.body.data.role).toBe("MANAGER");

    expect((await api(login.token).get("/inventory")).status).toBe(200); // the same token, now a manager
    expect((await refreshWith(login.cookie)).status).toBe(401); // but they must log in again
  });

  it("someone who took an order can only be disabled; an unused account can be deleted", async () => {
    const cat = await makeCategory(shop.id, "Staff Menu");
    const item = await makeProduct(shop.id, cat.id, { stock: 10 });

    const worker = await owner().post("/staff", staffBody());
    const workerLogin = await loginWith(worker.body.data.staff.phone, worker.body.data.temporaryPassword);
    await placeOrder(workerLogin.token, { items: [{ productId: item.id, quantity: 1 }] });
    const blocked = await owner().del(`/staff/${worker.body.data.staff.id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("STAFF_HAS_HISTORY");

    const unused = await owner().post("/staff", staffBody());
    expect((await owner().del(`/staff/${unused.body.data.staff.id}`)).status).toBe(200);
    expect(await prisma.user.count({ where: { id: unused.body.data.staff.id } })).toBe(0);
  });

  it("the owner account cannot be changed here", async () => {
    for (const res of [
      await owner().patch(`/staff/${shop.owner.id}/status`, { isActive: false }),
      await owner().del(`/staff/${shop.owner.id}`),
      await owner().post(`/staff/${shop.owner.id}/reset-password`),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("OWNER_PROTECTED");
    }
  });

  it("another cafe cannot see or change this cafe's staff", async () => {
    const intruder = api(other.owner.token);
    expect((await intruder.put(`/staff/${shop.cashier.id}`, staffBody({ phone: shop.cashier.phone }))).status).toBe(404);
    expect((await intruder.patch(`/staff/${shop.cashier.id}/status`, { isActive: false })).status).toBe(404);
    expect((await intruder.post(`/staff/${shop.cashier.id}/reset-password`)).status).toBe(404);
    expect((await intruder.del(`/staff/${shop.cashier.id}`)).status).toBe(404);
    expect(JSON.stringify((await intruder.get("/staff")).body)).not.toContain(shop.cashier.id);
  });
});

describe("the signed-in person's own account", () => {
  let shop: TestShop;
  beforeAll(async () => {
    shop = await createShop("account");
  });

  it("anyone can change their name, but only the owner can change their login", async () => {
    const renamed = await api(shop.cashier.token).put("/account/profile", { name: "Cashier Renamed", phone: shop.cashier.phone, email: shop.cashier.email });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ name: "Cashier Renamed", canChangeLogin: false });

    const login = await api(shop.cashier.token).put("/account/profile", { name: "Cashier Renamed", phone: phone(), email: shop.cashier.email });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("LOGIN_MANAGED_BY_OWNER");

    expect((await api(shop.owner.token).get("/account")).body.data.canChangeLogin).toBe(true);
  });

  it("the owner needs the current password to change the email", async () => {
    const newEmail = `changed-${uuid().slice(0, 8)}@leopos.test`;
    const body = { name: shop.owner.name, phone: shop.owner.phone, email: newEmail };

    const none = await api(shop.owner.token).put("/account/profile", body);
    expect(none.body.error.code).toBe("PASSWORD_REQUIRED");
    const wrong = await api(shop.owner.token).put("/account/profile", { ...body, currentPassword: "WrongPass123" });
    expect(wrong.body.error.code).toBe("WRONG_CURRENT_PASSWORD");
    const ok = await api(shop.owner.token).put("/account/profile", { ...body, currentPassword: PASSWORD });
    expect(ok.status).toBe(200);
    expect((await loginWith(newEmail, PASSWORD)).status).toBe(200);

    const noLogin = await api(shop.owner.token).put("/account/profile", { name: shop.owner.name, phone: "", email: "", currentPassword: PASSWORD });
    expect(noLogin.status).toBe(400); // at least a phone or an email must stay
  });

  it("changing the password ends the OTHER sessions and keeps this one", async () => {
    const here = await loginWith(shop.manager.email, PASSWORD);
    const there = await loginWith(shop.manager.email, PASSWORD);

    const change = (body: unknown) =>
      request(app)
        .post("/api/v1/account/change-password")
        .set("Authorization", `Bearer ${here.token}`)
        .set("Cookie", `leo_refresh=${here.cookie}`)
        .send(body as object);

    expect((await change({ currentPassword: "WrongPass123", newPassword: "BrandNew123", confirmPassword: "BrandNew123" })).body.error.code).toBe("WRONG_CURRENT_PASSWORD");
    expect((await change({ currentPassword: PASSWORD, newPassword: "short1", confirmPassword: "short1" })).status).toBe(400);
    expect((await change({ currentPassword: PASSWORD, newPassword: "BrandNew123", confirmPassword: "Different123" })).status).toBe(400);

    const ok = await change({ currentPassword: PASSWORD, newPassword: "BrandNew123", confirmPassword: "BrandNew123" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.otherSessionsEnded).toBeGreaterThanOrEqual(1);

    expect((await refreshWith(there.cookie)).status).toBe(401); // the other device is logged out
    expect((await refreshWith(here.cookie)).status).toBe(200); // this one stays
    expect((await loginWith(shop.manager.email, PASSWORD)).status).toBe(401);
    expect((await loginWith(shop.manager.email, "BrandNew123")).status).toBe(200);
  });
});

describe("what each role can do", () => {
  let shop: TestShop;
  let cat: { id: string };
  let item: { id: string };
  beforeAll(async () => {
    shop = await createShop("roles");
    cat = await makeCategory(shop.id, "Roles Menu");
    item = await makeProduct(shop.id, cat.id, { price: "100.00", gst: "5.00", stock: 50 });
  });

  const allowed = (res: { status: number }) => res.status !== 401 && res.status !== 403;

  it("owner, manager and cashier each get exactly their own doors", async () => {
    const order = await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }] });
    const paid = await payOrder(shop.cashier.token, order.id);
    const from = today();

    const doors: Array<[string, (token: string) => Promise<{ status: number }>, boolean, boolean, boolean]> = [
      // [what, call, owner, manager, cashier]
      ["dashboard", (t) => api(t).get("/dashboard"), true, true, true],
      ["view orders", (t) => api(t).get("/orders"), true, true, true],
      ["view customers", (t) => api(t).get("/customers"), true, true, true],
      ["view products", (t) => api(t).get("/products"), true, true, true],
      ["order screen", (t) => api(t).get("/pos/catalog"), true, false, true],
      ["payments list", (t) => api(t).get("/payments"), true, false, true],
      ["invoice", (t) => api(t).get(`/invoices/${paid.invoiceId}`), true, false, true],
      ["inventory", (t) => api(t).get("/inventory"), true, true, false],
      ["reports", (t) => api(t).get(`/reports/sales?from=${from}&to=${from}`), true, true, false],
      ["add a category", (t) => api(t).post("/categories", { name: `Cat ${uuid().slice(0, 6)}`, imageUrl: null, isActive: true }), true, true, false],
      ["staff list", (t) => api(t).get("/staff"), true, false, false],
      ["cafe settings", (t) => api(t).get("/settings"), true, false, false],
      ["own account", (t) => api(t).get("/account"), true, true, true],
      ["app settings", (t) => api(t).get("/settings/app"), true, true, true],
    ];

    const wrong: string[] = [];
    for (const [what, call, owner, manager, cashier] of doors) {
      for (const [who, token, expected] of [
        ["owner", shop.owner.token, owner],
        ["manager", shop.manager.token, manager],
        ["cashier", shop.cashier.token, cashier],
      ] as const) {
        const res = await call(token);
        if (allowed(res) !== expected) wrong.push(`${who} ${expected ? "should" : "should NOT"} be able to: ${what} (got ${res.status})`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("a cashier never sees what things cost or what profit is made", async () => {
    const products = await api(shop.cashier.token).get("/products");
    expect(JSON.stringify(products.body)).not.toMatch(/"costPrice":"|"profit":"/);
    const dashboard = await api(shop.cashier.token).get("/dashboard?range=today");
    expect(dashboard.body.data.today.profit).toBeNull();
    const catalog = await api(shop.cashier.token).get("/pos/catalog");
    expect(JSON.stringify(catalog.body)).not.toMatch(/cost/i);
  });

  it("only the owner and managers can delete a customer", async () => {
    const mobile = phone();
    await placeOrder(shop.cashier.token, { items: [{ productId: item.id, quantity: 1 }], customerName: "Delete Me", customerPhone: mobile });
    const customer = await prisma.customer.findFirst({ where: { shopId: shop.id, phone: mobile } });
    expect((await api(shop.cashier.token).del(`/customers/${customer!.id}`)).status).toBe(403);
    expect((await api(shop.manager.token).del(`/customers/${customer!.id}`)).status).toBe(200);
  });
});

describe("one cafe can never reach another cafe's data", () => {
  it("every address that takes an id answers 'not found' for a stranger, and lists show nothing of the other cafe", async () => {
    const mine = await createShop("tenant-a");
    const theirs = await createShop("tenant-b");

    const cat = await makeCategory(mine.id, "Secret Category");
    const product = await makeProduct(mine.id, cat.id, { name: "Secret Product", stock: 20 });
    const mobile = phone();
    const order = await placeOrder(mine.cashier.token, { items: [{ productId: product.id, quantity: 1 }], customerName: "Secret Customer", customerPhone: mobile });
    const paid = await payOrder(mine.cashier.token, order.id, "UPI");
    const customer = await prisma.customer.findFirst({ where: { shopId: mine.id, phone: mobile } });

    const intruder = api(theirs.owner.token);
    const attacks: Array<[string, Promise<{ status: number }>]> = [
      ["get product", intruder.get(`/products/${product.id}`)],
      ["change product", intruder.patch(`/products/${product.id}/availability`, { isAvailable: false })],
      ["delete product", intruder.del(`/products/${product.id}`)],
      ["change category", intruder.put(`/categories/${cat.id}`, { name: "Hacked", imageUrl: null, isActive: false })],
      ["delete category", intruder.del(`/categories/${cat.id}`)],
      ["get order", intruder.get(`/orders/${order.id}`)],
      ["change order", intruder.patch(`/orders/${order.id}/status`, { status: "CANCELLED" })],
      ["get invoice", intruder.get(`/invoices/${paid.invoiceId}`)],
      ["get customer", intruder.get(`/customers/${customer!.id}`)],
      ["get customer orders", intruder.get(`/customers/${customer!.id}/orders`)],
      ["delete customer", intruder.del(`/customers/${customer!.id}`)],
      ["pay an order", intruder.post("/payments", { orderId: order.id, method: "UPI", idempotencyKey: uuid() })],
      ["change stock", intruder.post("/inventory/adjust", { action: "IN", productId: product.id, quantity: 5, idempotencyKey: uuid() })],
    ];
    const results = await Promise.all(attacks.map(([, pending]) => pending));
    const wrong = attacks.map(([name], i) => ({ name, status: results[i].status })).filter((r) => r.status !== 404);
    expect(wrong).toEqual([]);

    // Nothing was changed by the attacks
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.isAvailable).toBe(true);
    expect(await stockOf(product.id)).toBe(19);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe("PENDING");

    // And the stranger's lists contain nothing of ours
    const secrets = [product.id, cat.id, order.id, paid.invoiceNo, customer!.id, mobile, "Secret Product", "Secret Category", "Secret Customer"];
    const lists = ["/products", "/categories", "/orders", "/customers", "/payments", "/invoices", "/staff", "/inventory", "/inventory/history", "/pos/catalog"];
    for (const path of lists) {
      const text = JSON.stringify((await intruder.get(path)).body);
      for (const secret of secrets) expect(text, `${path} leaked ${secret}`).not.toContain(secret);
    }
    expect(cookieOf).toBeTypeOf("function");
  });
});

async function stockOf(productId: string) {
  return (await prisma.inventory.findUnique({ where: { productId } }))!.quantity;
}
