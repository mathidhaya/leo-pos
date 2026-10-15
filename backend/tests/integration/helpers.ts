import crypto from "crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../../src/app";
import { prisma } from "../../src/config/db";
import { resolveRange } from "../../src/utils/dateRange";
import { signAccessToken } from "../../src/utils/tokens";

export { app, prisma };

export type Role = "OWNER" | "MANAGER" | "CASHIER";
export const PASSWORD = "Passw0rdTest";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4); // a low cost, so tests stay fast

export interface TestUser {
  id: string;
  role: Role;
  name: string;
  email: string;
  phone: string;
  password: string;
  token: string; // a valid access token, so tests do not have to log in every time
}

export interface TestShop {
  id: string;
  name: string;
  owner: TestUser;
  manager: TestUser;
  cashier: TestUser;
}

export const uuid = () => crypto.randomUUID();
const word = () => crypto.randomBytes(4).toString("hex");
// A valid, random Indian mobile number
export const phone = () => `9${String(crypto.randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
// Today's date (YYYY-MM-DD) in India time, the same way the app works it out
export const today = () => resolveRange({ range: "today" }).from;
export const paise = (text: string) => Math.round(Number(text) * 100);

// ---------- what to clean up afterwards ----------

const createdShops: string[] = [];
const createdIdentifiers: string[] = [];

export const trackShop = (id: string) => void createdShops.push(id);
export const trackIdentifier = (identifier: string) => void createdIdentifiers.push(identifier);

// Removes every cafe a test made (in the order the database allows), then closes the connection
export async function cleanupAll(): Promise<void> {
  for (const shopId of createdShops.splice(0)) {
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
  const identifiers = createdIdentifiers.splice(0);
  if (identifiers.length > 0) await prisma.otpVerification.deleteMany({ where: { identifier: { in: identifiers } } });
  await prisma.$disconnect();
}

// ---------- people and cafes ----------

export async function createUser(shopId: string, role: Role, label: string = role.toLowerCase()): Promise<TestUser> {
  const email = `${label}-${word()}@leopos.test`;
  const mobile = phone();
  const name = `Test ${label}`;
  const user = await prisma.user.create({
    data: { shopId, name, email, phone: mobile, passwordHash: PASSWORD_HASH, role, staff: { create: {} } },
  });
  return {
    id: user.id,
    role,
    name,
    email,
    phone: mobile,
    password: PASSWORD,
    token: signAccessToken({ id: user.id, shopId, role }),
  };
}

// A new cafe with an owner, a manager and a cashier
export async function createShop(label = "shop"): Promise<TestShop> {
  const shop = await prisma.shop.create({ data: { name: `Test ${label} ${word()}`, settings: { create: {} } } });
  trackShop(shop.id);
  return {
    id: shop.id,
    name: shop.name,
    owner: await createUser(shop.id, "OWNER", "owner"),
    manager: await createUser(shop.id, "MANAGER", "manager"),
    cashier: await createUser(shop.id, "CASHIER", "cashier"),
  };
}

// ---------- talking to the API ----------

type Method = "get" | "post" | "put" | "patch" | "delete";

function call(method: Method, token: string | undefined, url: string, body?: unknown): Promise<request.Response> {
  let req = (request(app) as any)[method](`/api/v1${url}`);
  if (token) req = req.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) req = req.send(body);
  return req;
}

export const api = (token?: string) => ({
  get: (url: string) => call("get", token, url),
  post: (url: string, body?: unknown) => call("post", token, url, body),
  put: (url: string, body?: unknown) => call("put", token, url, body),
  patch: (url: string, body?: unknown) => call("patch", token, url, body),
  del: (url: string) => call("delete", token, url),
});

// A file (a PDF or a CSV): returns the raw bytes
export async function download(token: string, url: string) {
  const res = await (request(app) as any)
    .get(`/api/v1${url}`)
    .set("Authorization", `Bearer ${token}`)
    .buffer(true)
    .parse((response: any, done: (err: Error | null, body: Buffer) => void) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => done(null, Buffer.concat(chunks)));
    });
  return { status: res.status as number, headers: res.headers as Record<string, string>, body: res.body as Buffer };
}

// The refresh cookie that a login or refresh response sets
export function cookieOf(res: request.Response): string | undefined {
  const cookies = ([] as string[]).concat((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []);
  const raw = cookies.find((cookie) => cookie.startsWith("leo_refresh="));
  return raw ? raw.split(";")[0].slice("leo_refresh=".length) : undefined;
}

export async function loginWith(identifier: string, password: string) {
  const res = await request(app).post("/api/v1/auth/login").send({ identifier, password });
  return { status: res.status, body: res.body, token: res.body?.data?.accessToken as string, cookie: cookieOf(res) as string };
}

export const refreshWith = (cookie: string) =>
  request(app).post("/api/v1/auth/refresh").set("Cookie", `leo_refresh=${cookie}`);

// ---------- menu and stock ----------

export const makeCategory = (shopId: string, name = `Cat ${word()}`, isActive = true) =>
  prisma.category.create({ data: { shopId, name, isActive } });

export interface ProductOptions {
  name?: string;
  sku?: string;
  price?: string;
  cost?: string;
  gst?: string;
  stock?: number;
  minStock?: number;
  available?: boolean;
}

export const makeProduct = (shopId: string, categoryId: string, o: ProductOptions = {}) =>
  prisma.product.create({
    data: {
      shopId,
      categoryId,
      name: o.name ?? `Product ${word()}`,
      sku: o.sku ?? `T-${word().toUpperCase()}`,
      sellingPrice: o.price ?? "100.00",
      costPrice: o.cost ?? "40.00",
      gstPercent: o.gst ?? "5.00",
      isAvailable: o.available ?? true,
      inventory: { create: { quantity: o.stock ?? 100, minStock: o.minStock ?? 0 } },
    },
  });

export async function stockOf(productId: string): Promise<number> {
  const row = await prisma.inventory.findUnique({ where: { productId } });
  return row ? row.quantity : -1;
}

// ---------- orders and payments through the real API ----------

export interface OrderInput {
  items: Array<{ productId: string; quantity: number }>;
  discount?: { type: "none" } | { type: "percent" | "amount"; value: string };
  orderType?: "DINE_IN" | "TAKE_AWAY" | "DELIVERY";
  deliveryCharge?: string;
  tableNo?: string;
  guests?: number | null;
  customerName?: string;
  customerPhone?: string;
  address?: string;
}

// The body of an order request, with the total the cashier is supposed to have seen
export function orderBody(input: OrderInput, expectedTotal: string, key: string = uuid()) {
  return { discount: { type: "none" }, orderType: "TAKE_AWAY", ...input, idempotencyKey: key, expectedTotal };
}

export async function quoteTotal(token: string, input: OrderInput): Promise<string> {
  const res = await api(token).post("/pos/quote", { discount: { type: "none" }, orderType: "TAKE_AWAY", ...input });
  if (res.status !== 200) throw new Error(`The quote failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.grandTotal;
}

// Checks the price with the server, then places the order (like the order screen does). Returns the order.
export async function placeOrder(token: string, input: OrderInput) {
  const total = await quoteTotal(token, input);
  const res = await api(token).post("/orders", orderBody(input, total));
  if (res.status !== 201) throw new Error(`The order failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function payOrder(token: string, orderId: string, method = "UPI", amountReceived?: string) {
  const res = await api(token).post("/payments", { orderId, method, amountReceived, idempotencyKey: uuid() });
  if (res.status !== 201) throw new Error(`The payment failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export const sortedStatuses = (responses: Array<{ status: number }>) => responses.map((r) => r.status).sort((a, b) => a - b);
