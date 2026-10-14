import "dotenv/config";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing in .env");
if (process.env.NODE_ENV === "production") throw new Error("This check is for development only.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const BASE = process.env.API_BASE ?? `http://localhost:${process.env.PORT ?? 5000}/api/v1`;

type Json = any;
interface Reply {
  status: number;
  json: Json;
}

async function api(method: string, path: string, token?: string, body?: unknown): Promise<Reply> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: Json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // a file (for example a PDF), not JSON
  }
  return { status: res.status, json };
}

const results: Array<{ name: string; ok: boolean }> = [];

function check(name: string, ok: boolean, detail = ""): void {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `   -> ${detail}`}`);
}

function expectStatus(name: string, reply: Reply, status: number): void {
  const code = reply.json?.error?.code ? ` ${reply.json.error.code}` : "";
  check(name, reply.status === status, `got ${reply.status}${code}, expected ${status}`);
}

const uuid = () => crypto.randomUUID();
const phone = () => `9${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
const today = new Date().toISOString().slice(0, 10);

function must(reply: Reply, what: string): Json {
  if (reply.status < 200 || reply.status >= 300) {
    throw new Error(`Setup failed (${what}): ${reply.status} ${JSON.stringify(reply.json?.error ?? reply.json)}`);
  }
  return reply.json.data;
}

interface Tenant {
  shopId: string;
  token: string;
}
const createdShops: string[] = [];

async function createTenant(label: string): Promise<Tenant> {
  const password = `${crypto.randomBytes(9).toString("base64url")}a1`;
  const email = `tenant-${label.toLowerCase()}-${crypto.randomBytes(4).toString("hex")}@leopos.test`;

  const shop = await prisma.shop.create({ data: { name: `Tenant check ${label}`, settings: { create: {} } } });
  createdShops.push(shop.id);
  await prisma.user.create({
    data: {
      shopId: shop.id,
      name: `Owner ${label}`,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "OWNER",
      staff: { create: {} },
    },
  });

  const login = await api("POST", "/auth/login", undefined, { identifier: email, password });
  if (login.status !== 200) throw new Error(`Could not log in as cafe ${label}: ${login.status} ${login.json?.error?.message ?? ""}`);
  return { shopId: shop.id, token: login.json.data.accessToken };
}

async function removeShop(shopId: string): Promise<void> {
  await prisma.inventoryTransaction.deleteMany({ where: { product: { shopId } } });
  await prisma.payment.deleteMany({ where: { order: { shopId } } });
  await prisma.invoice.deleteMany({ where: { shopId } });
  await prisma.order.deleteMany({ where: { shopId } });
  await prisma.customer.deleteMany({ where: { shopId } });
  await prisma.product.deleteMany({ where: { shopId } });
  await prisma.category.deleteMany({ where: { shopId } });
  await prisma.auditLog.deleteMany({ where: { shopId } });
  await prisma.user.deleteMany({ where: { shopId } });
  await prisma.shop.delete({ where: { id: shopId } });
}

async function main(): Promise<void> {
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health || !health.ok) throw new Error("The backend is not running. Start it with: npm run dev");

  console.log("Creating two temporary cafes (A and B)...\n");
  const A = await createTenant("A");
  const B = await createTenant("B");

  // ---------- cafe A gets real data, made through the normal API ----------
  const category = must(await api("POST", "/categories", A.token, { name: "Check Drinks", imageUrl: null, isActive: true }), "category");
  const product = must(
    await api("POST", "/products", A.token, {
      name: "Check Coffee",
      sku: "CHK-001",
      categoryId: category.id,
      description: "",
      sellingPrice: "100",
      costPrice: "40",
      gstPercent: "5",
      prepTimeMin: null,
      minStock: 1,
      stockQuantity: 20,
      isAvailable: true,
    }),
    "product"
  );
  const customerPhone = phone();
  const customer = must(
    await api("POST", "/customers", A.token, { name: "Check Customer", phone: customerPhone, email: "", address: "" }),
    "customer"
  );
  const order = must(
    await api("POST", "/orders", A.token, {
      items: [{ productId: product.id, quantity: 1 }],
      discount: { type: "none" },
      orderType: "TAKE_AWAY",
      customerName: "Check Customer",
      customerPhone,
      idempotencyKey: uuid(),
      expectedTotal: "105.00",
    }),
    "order"
  );
  const payment = must(await api("POST", "/payments", A.token, { orderId: order.id, method: "UPI", idempotencyKey: uuid() }), "payment");
  const staff = must(
    await api("POST", "/staff", A.token, { name: "Check Cashier", phone: phone(), email: "", role: "CASHIER", joiningDate: today }),
    "staff"
  ).staff;

  const mine = {
    product: product.id,
    category: category.id,
    customer: customer.id,
    order: order.id,
    invoice: payment.invoiceId,
    staff: staff.id,
  };

  // ---------- the controls: cafe A CAN see its own data (otherwise every "404" below would prove nothing) ----------
  console.log("Controls: cafe A can use its own data");
  for (const [name, path] of [
    ["product", `/products/${mine.product}`],
    ["order", `/orders/${mine.order}`],
    ["customer", `/customers/${mine.customer}`],
    ["invoice", `/invoices/${mine.invoice}`],
  ] as const) {
    expectStatus(`A can open its own ${name}`, await api("GET", path, A.token), 200);
  }

  // ---------- cafe B attacks every address that takes an id ----------
  console.log("\nCafe B tries to read or change cafe A's records by id (each must be 404)");
  const hackedProduct = {
    name: "Hacked",
    sku: "HACK-1",
    categoryId: mine.category,
    description: "",
    sellingPrice: "1",
    costPrice: "1",
    gstPercent: "5",
    prepTimeMin: null,
    minStock: 0,
    isAvailable: true,
  };
  const attacks: Array<[string, string, unknown?]> = [
    ["GET", `/products/${mine.product}`],
    ["PUT", `/products/${mine.product}`, hackedProduct],
    ["PATCH", `/products/${mine.product}/availability`, { isAvailable: false }],
    ["DELETE", `/products/${mine.product}`],
    ["PUT", `/categories/${mine.category}`, { name: "Hacked", imageUrl: null, isActive: false }],
    ["DELETE", `/categories/${mine.category}`],
    ["GET", `/orders/${mine.order}`],
    ["PATCH", `/orders/${mine.order}/status`, { status: "CANCELLED" }],
    ["GET", `/invoices/${mine.invoice}`],
    ["GET", `/invoices/${mine.invoice}/pdf`],
    ["GET", `/customers/${mine.customer}`],
    ["GET", `/customers/${mine.customer}/orders`],
    ["PUT", `/customers/${mine.customer}`, { name: "Hacked", phone: phone(), email: "", address: "" }],
    ["DELETE", `/customers/${mine.customer}`],
    ["PUT", `/staff/${mine.staff}`, { name: "Hacked Name", phone: phone(), email: "", role: "MANAGER", joiningDate: today }],
    ["PATCH", `/staff/${mine.staff}/status`, { isActive: false }],
    ["POST", `/staff/${mine.staff}/reset-password`],
    ["DELETE", `/staff/${mine.staff}`],
    ["POST", "/payments", { orderId: mine.order, method: "UPI", idempotencyKey: uuid() }],
    ["POST", "/inventory/adjust", { action: "IN", productId: mine.product, quantity: 5, idempotencyKey: uuid() }],
  ];
  for (const [method, path, body] of attacks) {
    expectStatus(`B cannot ${method} ${path.replace(/[0-9a-f-]{36}/g, ":id")}`, await api(method, path, B.token, body), 404);
  }

  // Selling cafe A's product from cafe B is refused as "no such product"
  const sellBody = {
    items: [{ productId: mine.product, quantity: 1 }],
    discount: { type: "none" },
    orderType: "TAKE_AWAY",
  };
  expectStatus("B cannot price cafe A's product", await api("POST", "/pos/quote", B.token, sellBody), 422);
  expectStatus(
    "B cannot sell cafe A's product",
    await api("POST", "/orders", B.token, { ...sellBody, idempotencyKey: uuid(), expectedTotal: "105.00" }),
    422
  );

  // ---------- lists and totals of cafe B contain nothing of cafe A ----------
  console.log("\nCafe B's lists and totals contain nothing from cafe A");
  const secrets = [...Object.values(mine), "Check Coffee", "Check Drinks", "Check Customer", "Check Cashier", "CHK-001"];
  const lists = [
    "/products",
    "/categories",
    "/orders",
    "/customers",
    "/customers?q=Check",
    "/payments",
    "/invoices",
    "/staff",
    "/inventory",
    "/inventory/history",
    `/inventory/history?productId=${mine.product}`,
    "/pos/catalog",
    `/reports/products?from=${today}&to=${today}`,
    `/reports/categories?from=${today}&to=${today}`,
    `/reports/payments?from=${today}&to=${today}`,
  ];
  for (const path of lists) {
    const reply = await api("GET", path, B.token);
    const text = JSON.stringify(reply.json);
    const leaked = secrets.filter((secret) => text.includes(String(secret)));
    check(`B's GET ${path} shows nothing of A`, reply.status === 200 && leaked.length === 0, leaked.length ? `leaked: ${leaked.join(", ")}` : `status ${reply.status}`);
  }

  const dashboard = await api("GET", "/dashboard?range=today", B.token);
  check(
    "B's dashboard is empty although A sold something today",
    dashboard.json?.data?.today?.orders === 0 && dashboard.json?.data?.today?.sales === "0.00",
    JSON.stringify(dashboard.json?.data?.today)
  );
  const sales = await api("GET", `/reports/sales?from=${today}&to=${today}&groupBy=day`, B.token);
  check(
    "B's sales report is empty",
    sales.json?.data?.summary?.orders === 0 && sales.json?.data?.summary?.total === "0.00",
    JSON.stringify(sales.json?.data?.summary)
  );

  // ---------- nothing of cafe A was changed by the attacks ----------
  console.log("\nCafe A's data is untouched");
  const productNow = await api("GET", `/products/${mine.product}`, A.token);
  check("A's product still has its name and is available", productNow.json?.data?.name === "Check Coffee" && productNow.json?.data?.isAvailable === true);
  check("A's product kept its stock", productNow.json?.data?.stock?.quantity === 19, `stock ${productNow.json?.data?.stock?.quantity}, expected 19`);
  const orderNow = await api("GET", `/orders/${mine.order}`, A.token);
  check("A's order is still pending and paid", orderNow.json?.data?.status === "PENDING" && orderNow.json?.data?.paymentStatus === "PAID");
  expectStatus("A's customer still exists", await api("GET", `/customers/${mine.customer}`, A.token), 200);
  const staffNow = await api("GET", "/staff", A.token);
  const stillActive = (staffNow.json?.data?.items ?? []).some((member: Json) => member.id === mine.staff && member.isActive === true);
  check("A's staff member still exists and is active", stillActive);
  const categoriesNow = await api("GET", "/categories", A.token);
  check("A's category still exists", JSON.stringify(categoriesNow.json).includes(mine.category));
}

main()
  .catch((err) => {
    console.error(`\nThe check could not finish: ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const shopId of createdShops) {
      try {
        await removeShop(shopId);
      } catch (err) {
        console.error(`\nCould not remove the temporary cafe ${shopId}. Delete it by hand in Prisma Studio.`, err);
        process.exitCode = 1;
      }
    }
    await prisma.$disconnect();

    const failed = results.filter((r) => !r.ok).length;
    if (results.length > 0) {
      console.log(
        failed === 0
          ? `\nAll ${results.length} checks passed. The temporary cafes were removed.`
          : `\n${failed} of ${results.length} checks FAILED. The temporary cafes were removed.`
      );
    }
    if (failed > 0) process.exitCode = 1;
  });
