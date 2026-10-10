import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import {
  BUSINESS_TIME_ZONE,
  buildBuckets,
  resolveRange,
  type RangeInput,
  type ResolvedRange,
} from "../utils/dateRange";

const TZ = BUSINESS_TIME_ZONE;

// $1 = shop id, $2 = range start, $3 = range end (exclusive).
// These SQL strings are fixed text. Every value reaches the database as a bound parameter,
// so nothing the user sends is ever pasted into the SQL.
const IN_RANGE = `o.shop_id = $1::uuid
  AND o.created_at >= ($2::timestamptz AT TIME ZONE 'UTC')
  AND o.created_at <  ($3::timestamptz AT TIME ZONE 'UTC')`;

// Only paid, non-cancelled orders count as money earned
const COUNTED = `o.payment_status = 'PAID' AND o.status <> 'CANCELLED'`;

// profit = selling price x qty - discount - cost price x qty  (GST and delivery are not profit)
const PROFIT_EXPR = `oi.unit_price * oi.quantity - oi.discount - oi.cost_price * oi.quantity`;

export interface Summary {
  sales: string;
  orders: number;
  pending: number;
  completed: number;
  cancelled: number;
  profit: string | null;
}

interface SummaryRow {
  sales: string;
  orders: number;
  pending: number;
  completed: number;
  cancelled: number;
}

async function getSummary(
  shopId: string,
  start: Date,
  end: Date,
  includeProfit: boolean
): Promise<Summary> {
  const s = start.toISOString();
  const e = end.toISOString();

  const [counts, profit] = await Promise.all([
    prisma.$queryRawUnsafe<SummaryRow[]>(
      `SELECT
         ROUND(COALESCE(SUM(o.grand_total) FILTER (WHERE ${COUNTED}), 0), 2)::text AS sales,
         (COUNT(*) FILTER (WHERE o.status <> 'CANCELLED'))::int AS orders,
         (COUNT(*) FILTER (WHERE o.status IN ('PENDING', 'PREPARING', 'READY')))::int AS pending,
         (COUNT(*) FILTER (WHERE o.status = 'COMPLETED'))::int AS completed,
         (COUNT(*) FILTER (WHERE o.status = 'CANCELLED'))::int AS cancelled
       FROM orders o
       WHERE ${IN_RANGE}`,
      shopId,
      s,
      e
    ),
    includeProfit
      ? prisma.$queryRawUnsafe<Array<{ profit: string }>>(
          `SELECT ROUND(COALESCE(SUM(${PROFIT_EXPR}), 0), 2)::text AS profit
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE ${IN_RANGE} AND ${COUNTED}`,
          shopId,
          s,
          e
        )
      : Promise.resolve(null),
  ]);

  const c = counts[0];
  return {
    sales: c.sales,
    orders: c.orders,
    pending: c.pending,
    completed: c.completed,
    cancelled: c.cancelled,
    profit: profit ? profit[0].profit : null,
  };
}

async function getSeries(shopId: string, range: ResolvedRange, includeProfit: boolean) {
  // "hour" or "day" only: a fixed choice made by our own code, never user text
  const unit = range.granularity;
  const format = unit === "hour" ? `YYYY-MM-DD"T"HH24` : `YYYY-MM-DD`;
  const bucketExpr = `to_char(date_trunc('${unit}', (o.created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'), '${format}')`;
  const s = range.start.toISOString();
  const e = range.end.toISOString();

  const [salesRows, profitRows] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ bucket: string; sales: string; orders: number }>>(
      `SELECT ${bucketExpr} AS bucket,
         ROUND(COALESCE(SUM(o.grand_total) FILTER (WHERE ${COUNTED}), 0), 2)::text AS sales,
         (COUNT(*) FILTER (WHERE o.status <> 'CANCELLED'))::int AS orders
       FROM orders o
       WHERE ${IN_RANGE}
       GROUP BY 1`,
      shopId,
      s,
      e
    ),
    includeProfit
      ? prisma.$queryRawUnsafe<Array<{ bucket: string; profit: string }>>(
          `SELECT ${bucketExpr} AS bucket,
             ROUND(COALESCE(SUM(${PROFIT_EXPR}), 0), 2)::text AS profit
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE ${IN_RANGE} AND ${COUNTED}
           GROUP BY 1`,
          shopId,
          s,
          e
        )
      : Promise.resolve(null),
  ]);

  const salesByBucket = new Map(salesRows.map((row) => [row.bucket, row]));
  const profitByBucket = new Map((profitRows ?? []).map((row) => [row.bucket, row.profit]));

  // Fill the gaps, so hours or days with no sales still appear as zero
  return buildBuckets(range).map((bucket) => ({
    bucket: bucket.key,
    label: bucket.label,
    sales: salesByBucket.get(bucket.key)?.sales ?? "0.00",
    orders: salesByBucket.get(bucket.key)?.orders ?? 0,
    profit: includeProfit ? (profitByBucket.get(bucket.key) ?? "0.00") : null,
  }));
}

async function getTopProducts(shopId: string, range: ResolvedRange) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; name: string; imageUrl: string | null; quantity: number; revenue: string }>
  >(
    `SELECT p.id, p.name, p.image_url AS "imageUrl",
       (SUM(oi.quantity))::int AS quantity,
       ROUND(COALESCE(SUM(oi.unit_price * oi.quantity - oi.discount), 0), 2)::text AS revenue
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     WHERE ${IN_RANGE} AND ${COUNTED}
     GROUP BY p.id, p.name, p.image_url
     ORDER BY quantity DESC, SUM(oi.unit_price * oi.quantity - oi.discount) DESC
     LIMIT 5`,
    shopId,
    range.start.toISOString(),
    range.end.toISOString()
  );
  return rows;
}

async function getRecentOrders(shopId: string) {
  const orders = await prisma.order.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      orderNo: true,
      createdAt: true,
      orderType: true,
      grandTotal: true,
      status: true,
      paymentStatus: true,
      customer: { select: { name: true } },
      payments: { select: { method: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return orders.map((order) => ({
    id: order.id,
    orderNo: order.orderNo,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customer?.name ?? null,
    orderType: order.orderType,
    amount: order.grandTotal.toFixed(2),
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.payments[0]?.method ?? null,
  }));
}

export async function getDashboard(user: { shopId: string; role: RoleName }, input: RangeInput) {
  // Cost and profit are business-sensitive, so cashiers do not receive them
  const includeProfit = user.role !== "CASHIER";

  const range = resolveRange(input);
  const today = resolveRange({ range: "today" });
  const rangeIsToday =
    range.start.getTime() === today.start.getTime() && range.end.getTime() === today.end.getTime();

  const [todaySummary, rangeSummary, series, topProducts, recentOrders] = await Promise.all([
    getSummary(user.shopId, today.start, today.end, includeProfit),
    rangeIsToday ? Promise.resolve(null) : getSummary(user.shopId, range.start, range.end, includeProfit),
    getSeries(user.shopId, range, includeProfit),
    getTopProducts(user.shopId, range),
    getRecentOrders(user.shopId),
  ]);

  return {
    range: { key: range.key, from: range.from, to: range.to, granularity: range.granularity },
    canViewProfit: includeProfit,
    today: todaySummary,
    rangeSummary: rangeSummary ?? todaySummary,
    series,
    topProducts,
    recentOrders,
  };
}
