import "dotenv/config";
import crypto from "crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing in .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const SAMPLE_MARK = "SAMPLE";
const OFFSET_MS = 330 * 60 * 1000; // India time
const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;

// How popular each item is (higher = sells more)
const POPULARITY: Record<string, number> = {
  Cappuccino: 10,
  "Masala Tea": 9,
  "Veg Sandwich": 8,
  "French Fries": 7,
  "Cold Coffee": 6,
  Latte: 5,
  Burger: 5,
  Milkshake: 4,
  "Fresh Juice": 4,
};

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p: number) => Math.random() < p;
const pick = <T>(items: T[]): T => items[rand(0, items.length - 1)];
const money = (paise: number) => (paise / 100).toFixed(2);

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

function istMidnight(ms: number): number {
  const d = new Date(ms + OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - OFFSET_MS;
}

async function getOwner() {
  const email = process.env.SEED_OWNER_EMAIL;
  if (!email) throw new Error("SEED_OWNER_EMAIL is missing in backend/.env");
  const owner = await prisma.user.findUnique({ where: { email } });
  if (!owner) throw new Error("Owner account not found. Run npm run db:seed first.");
  return owner;
}

async function clear() {
  const owner = await getOwner();
  const link = { order: { shopId: owner.shopId, notes: SAMPLE_MARK } };

  const removed = await prisma.$transaction(async (tx) => {
    await tx.invoice.deleteMany({ where: link });
    await tx.payment.deleteMany({ where: link });
    return tx.order.deleteMany({ where: { shopId: owner.shopId, notes: SAMPLE_MARK } });
  });

  console.log(`Removed ${removed.count} sample orders.`);
}

async function generate(days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 45) {
    throw new Error("Days must be a whole number from 1 to 45.");
  }

  const owner = await getOwner();
  const shopId = owner.shopId;

  const existing = await prisma.order.count({ where: { shopId, notes: SAMPLE_MARK } });
  if (existing > 0) {
    throw new Error(`Sample orders already exist (${existing}). Run "npm run db:sample-orders:clear" first.`);
  }

  const [products, settings] = await Promise.all([
    prisma.product.findMany({ where: { shopId, isAvailable: true }, orderBy: { sku: "asc" } }),
    prisma.settings.findUnique({ where: { shopId } }),
  ]);
  if (products.length === 0 || !settings) {
    throw new Error("No products found. Run npm run db:seed first.");
  }

  const weights = products.map((p) => POPULARITY[p.name] ?? 3);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const pickProductIndex = () => {
    let r = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  };

  // ---- decide when each order happens ----
  const now = Date.now();
  const todayStart = istMidnight(now);
  const planned: Array<{ at: number }> = [];

  for (let back = days - 1; back >= 0; back--) {
    const dayStart = todayStart - back * DAY_MS;
    const count = back === 0 ? rand(10, 25) : rand(18, 45);
    let from = dayStart + 8 * HOUR_MS;
    let to = dayStart + 22 * HOUR_MS;

    if (back === 0) {
      to = Math.min(to, now);
      // Early morning: spread today's orders from midnight so there is something to show
      if (to - from < 30 * MIN_MS) {
        from = dayStart;
        to = Math.max(now, dayStart + MIN_MS);
      }
    }
    for (let i = 0; i < count; i++) planned.push({ at: rand(from, to) });
  }

  // A few orders in the last 20 minutes, so "pending" has something to show
  const fresh = rand(3, 6);
  for (let i = 0; i < fresh; i++) planned.push({ at: now - rand(1, 20) * MIN_MS });

  planned.sort((a, b) => a.at - b.at);

  // ---- build the rows (all money in whole paise, so there are no rounding errors) ----
  let orderNo = settings.nextOrderNumber;
  let invoiceNo = settings.nextInvoiceNumber;

  const orders: Array<Record<string, unknown>> = [];
  const items: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const invoices: Array<Record<string, unknown>> = [];

  for (const { at } of planned) {
    const id = crypto.randomUUID();
    const createdAt = new Date(at);

    const typeRoll = Math.random();
    const orderType = typeRoll < 0.5 ? "DINE_IN" : typeRoll < 0.85 ? "TAKE_AWAY" : "DELIVERY";
    const deliveryPaise = orderType === "DELIVERY" ? 3000 : 0;
    const discountPercent = chance(0.15) ? 10 : 0;

    const lineCount = Math.min(rand(1, 4), products.length);
    const chosen = new Set<number>();
    while (chosen.size < lineCount) chosen.add(pickProductIndex());

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    for (const index of chosen) {
      const product = products[index];
      const quantity = rand(1, 3);
      const unit = Math.round(Number(product.sellingPrice.toString()) * 100);
      const cost = Math.round(Number(product.costPrice.toString()) * 100);
      const gst = Number(product.gstPercent.toString());

      const gross = unit * quantity;
      const discount = Math.round((gross * discountPercent) / 100);
      const taxable = gross - discount;
      const tax = Math.round((taxable * gst) / 100);

      subtotal += gross;
      discountTotal += discount;
      taxTotal += tax;

      items.push({
        id: crypto.randomUUID(),
        orderId: id,
        productId: product.id,
        nameSnapshot: product.name,
        unitPrice: money(unit),
        costPrice: money(cost),
        gstPercent: gst.toFixed(2),
        quantity,
        discount: money(discount),
        taxAmount: money(tax),
        lineTotal: money(taxable + tax),
        createdAt,
      });
    }

    // The rule the database enforces: subtotal - discount + tax + delivery = grand total
    const grand = subtotal - discountTotal + taxTotal + deliveryPaise;

    const ageMinutes = (now - at) / MIN_MS;
    const status =
      chance(0.04) ? "CANCELLED" : ageMinutes < 25 ? pick(["PENDING", "PREPARING", "READY"]) : "COMPLETED";
    const paid = status !== "CANCELLED";

    orders.push({
      id,
      shopId,
      orderNo: orderNo++,
      orderType,
      tableNo: orderType === "DINE_IN" ? `T${rand(1, 8)}` : null,
      guests: orderType === "DINE_IN" ? rand(1, 4) : null,
      deliveryAddress: orderType === "DELIVERY" ? "Sample delivery address" : null,
      status,
      paymentStatus: paid ? "PAID" : "UNPAID",
      subtotal: money(subtotal),
      discount: money(discountTotal),
      tax: money(taxTotal),
      deliveryCharge: money(deliveryPaise),
      grandTotal: money(grand),
      notes: SAMPLE_MARK,
      createdById: owner.id,
      createdAt,
      updatedAt: createdAt,
    });

    if (paid) {
      const methodRoll = Math.random();
      const method = methodRoll < 0.4 ? "CASH" : methodRoll < 0.85 ? "UPI" : methodRoll < 0.97 ? "CARD" : "OTHER";
      const received = method === "CASH" ? Math.ceil(grand / 1000) * 1000 : null;

      payments.push({
        id: crypto.randomUUID(),
        orderId: id,
        method,
        amount: money(grand),
        amountReceived: received === null ? null : money(received),
        changeGiven: received === null ? "0.00" : money(received - grand),
        idempotencyKey: `sample-${id}`,
        createdById: owner.id,
        createdAt,
      });

      invoices.push({
        id: crypto.randomUUID(),
        shopId,
        orderId: id,
        invoiceNo: `${settings.invoicePrefix}-${String(invoiceNo++).padStart(6, "0")}`,
        issuedAt: createdAt,
      });
    }
  }

  // ---- save everything together or nothing ----
  await prisma.$transaction(
    async (tx) => {
      for (const part of chunk(orders, 200)) await tx.order.createMany({ data: part as never });
      for (const part of chunk(items, 200)) await tx.orderItem.createMany({ data: part as never });
      for (const part of chunk(payments, 200)) await tx.payment.createMany({ data: part as never });
      for (const part of chunk(invoices, 200)) await tx.invoice.createMany({ data: part as never });
      await tx.settings.update({
        where: { shopId },
        data: { nextOrderNumber: orderNo, nextInvoiceNumber: invoiceNo },
      });
    },
    { timeout: 120000 }
  );

  console.log(
    `Created ${orders.length} sample orders over ${days} day(s): ${items.length} items, ${payments.length} payments, ${invoices.length} invoices.`
  );
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Sample orders are for development only.");
  }

  const mode = process.argv[2];
  if (mode === "generate") await generate(Number(process.argv[3] ?? 14));
  else if (mode === "clear") await clear();
  else throw new Error('Use "generate" or "clear".');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
