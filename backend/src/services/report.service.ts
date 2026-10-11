import { prisma } from "../config/db";
import { paiseToDecimalString } from "../utils/billing";
import { BUSINESS_TIME_ZONE, resolveRange } from "../utils/dateRange";
import { decimalTextToPaise } from "../utils/paymentCalc";
import { buildReportBuckets, type GroupBy } from "../utils/reportBuckets";
import type { RangeQuery, TrendQuery } from "../validators/report.validators";

const TZ = BUSINESS_TIME_ZONE;

// $1 = shop id, $2 = range start, $3 = range end (exclusive).
// These SQL strings are fixed text. Every value reaches the database as a bound parameter,
// so nothing the user sends is ever pasted into the SQL.
const IN_RANGE = `o.shop_id = $1::uuid
  AND o.created_at >= ($2::timestamptz AT TIME ZONE 'UTC')
  AND o.created_at <  ($3::timestamptz AT TIME ZONE 'UTC')`;

// Only paid, non-cancelled orders count (the same rule as the dashboard)
const COUNTED = `o.payment_status = 'PAID' AND o.status <> 'CANCELLED'`;

const BUCKET_FORMAT: Record<GroupBy, string> = {
  day: "YYYY-MM-DD",
  week: "YYYY-MM-DD",
  month: "YYYY-MM",
  year: "YYYY",
};

// The unit and the format come from the fixed list above, never from the request text
function bucketSql(groupBy: GroupBy): string {
  return `to_char(date_trunc('${groupBy}', (o.created_at AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}'), '${BUCKET_FORMAT[groupBy]}')`;
}

// All the money maths is done in whole paise (integers), so there are no rounding errors
const paise = (text: string) => decimalTextToPaise(text);
const money = (value: number) => paiseToDecimalString(value);

function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

function window(shopId: string, from: string, to: string) {
  const range = resolveRange({ range: "custom", from, to });
  const args = [shopId, range.start.toISOString(), range.end.toISOString()] as const;
  return { range, args };
}

// ---------- sales and profit over time ----------

interface OrderBucketRow {
  bucket: string;
  orders: number;
  revenue: string;
  discount: string;
  tax: string;
  delivery: string;
  total: string;
}

interface TrendRow {
  bucket: string;
  label: string;
  short: string;
  orders: number;
  revenue: number;
  discount: number;
  tax: number;
  delivery: number;
  total: number;
  cost: number;
  profit: number;
}

async function getTrend(shopId: string, from: string, to: string, groupBy: GroupBy) {
  const { range, args } = window(shopId, from, to);
  const bucket = bucketSql(groupBy);

  const [orderRows, costRows, excluded] = await Promise.all([
    prisma.$queryRawUnsafe<OrderBucketRow[]>(
      `SELECT ${bucket} AS bucket,
         COUNT(*)::int AS orders,
         ROUND(COALESCE(SUM(o.subtotal), 0), 2)::text AS revenue,
         ROUND(COALESCE(SUM(o.discount), 0), 2)::text AS discount,
         ROUND(COALESCE(SUM(o.tax), 0), 2)::text AS tax,
         ROUND(COALESCE(SUM(o.delivery_charge), 0), 2)::text AS delivery,
         ROUND(COALESCE(SUM(o.grand_total), 0), 2)::text AS total
       FROM orders o
       WHERE ${IN_RANGE} AND ${COUNTED}
       GROUP BY 1`,
      ...args
    ),
    prisma.$queryRawUnsafe<Array<{ bucket: string; cost: string }>>(
      `SELECT ${bucket} AS bucket,
         ROUND(COALESCE(SUM(oi.cost_price * oi.quantity), 0), 2)::text AS cost
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE ${IN_RANGE} AND ${COUNTED}
       GROUP BY 1`,
      ...args
    ),
    // So the report can say how many orders were left out, and why
    prisma.$queryRawUnsafe<Array<{ unpaid: number; cancelled: number }>>(
      `SELECT
         (COUNT(*) FILTER (WHERE o.status <> 'CANCELLED' AND o.payment_status = 'UNPAID'))::int AS unpaid,
         (COUNT(*) FILTER (WHERE o.status = 'CANCELLED'))::int AS cancelled
       FROM orders o
       WHERE ${IN_RANGE}`,
      ...args
    ),
  ]);

  const byOrders = new Map(orderRows.map((row) => [row.bucket, row] as const));
  const byCost = new Map(costRows.map((row) => [row.bucket, row.cost] as const));

  const rows: TrendRow[] = buildReportBuckets(range.start.getTime(), range.end.getTime(), groupBy).map((b) => {
    const o = byOrders.get(b.key);
    const revenue = paise(o?.revenue ?? "0.00");
    const discount = paise(o?.discount ?? "0.00");
    const cost = paise(byCost.get(b.key) ?? "0.00");
    return {
      bucket: b.key,
      label: b.label,
      short: b.short,
      orders: o?.orders ?? 0,
      revenue,
      discount,
      tax: paise(o?.tax ?? "0.00"),
      delivery: paise(o?.delivery ?? "0.00"),
      total: paise(o?.total ?? "0.00"),
      cost,
      profit: revenue - discount - cost,
    };
  });

  const sum = (pick: (row: TrendRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  const totals = {
    orders: sum((r) => r.orders),
    revenue: sum((r) => r.revenue),
    discount: sum((r) => r.discount),
    tax: sum((r) => r.tax),
    delivery: sum((r) => r.delivery),
    total: sum((r) => r.total),
    cost: sum((r) => r.cost),
    profit: sum((r) => r.profit),
  };

  return {
    range: { from: range.from, to: range.to, groupBy },
    rows,
    totals,
    unpaidOrders: excluded[0]?.unpaid ?? 0,
    cancelledOrders: excluded[0]?.cancelled ?? 0,
  };
}

export async function getSalesReport(user: { shopId: string }, query: TrendQuery) {
  const trend = await getTrend(user.shopId, query.from, query.to, query.groupBy);
  const t = trend.totals;

  return {
    range: trend.range,
    summary: {
      orders: t.orders,
      total: money(t.total),
      averageOrder: money(t.orders > 0 ? Math.round(t.total / t.orders) : 0),
      revenue: money(t.revenue),
      discount: money(t.discount),
      tax: money(t.tax),
      delivery: money(t.delivery),
      profit: money(t.profit),
      unpaidOrders: trend.unpaidOrders,
      cancelledOrders: trend.cancelledOrders,
    },
    series: trend.rows.map((r) => ({
      bucket: r.bucket,
      label: r.label,
      short: r.short,
      orders: r.orders,
      revenue: money(r.revenue),
      discount: money(r.discount),
      tax: money(r.tax),
      delivery: money(r.delivery),
      total: money(r.total),
      profit: money(r.profit),
    })),
  };
}

export async function getProfitReport(user: { shopId: string }, query: TrendQuery) {
  const trend = await getTrend(user.shopId, query.from, query.to, query.groupBy);
  const t = trend.totals;
  const net = t.revenue - t.discount;

  return {
    range: trend.range,
    summary: {
      revenue: money(t.revenue),
      discount: money(t.discount),
      netSales: money(net),
      tax: money(t.tax),
      cost: money(t.cost),
      profit: money(t.profit),
      marginPercent: percent(t.profit, net),
    },
    series: trend.rows.map((r) => ({
      bucket: r.bucket,
      label: r.label,
      short: r.short,
      revenue: money(r.revenue),
      discount: money(r.discount),
      cost: money(r.cost),
      profit: money(r.profit),
      marginPercent: percent(r.profit, r.revenue - r.discount),
    })),
  };
}

// ---------- products and categories ----------

interface ItemGroupRow {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  revenue: string;
  discount: string;
  cost: string;
}

const ITEM_LIMIT = 1000;

// Fixed pieces of SQL, chosen by our own code (never text from the request)
const GROUPS = {
  product: {
    select: "p.id AS id, p.name AS name, p.sku AS sku, c.name AS category",
    group: "p.id, p.name, p.sku, c.name",
  },
  category: {
    select: "c.id AS id, c.name AS name, NULL::text AS sku, NULL::text AS category",
    group: "c.id, c.name",
  },
} as const;

async function queryItemGroups(shopId: string, from: string, to: string, kind: keyof typeof GROUPS) {
  const { range, args } = window(shopId, from, to);
  const g = GROUPS[kind];

  const rows = await prisma.$queryRawUnsafe<ItemGroupRow[]>(
    `SELECT ${g.select},
       (SUM(oi.quantity))::int AS quantity,
       ROUND(SUM(oi.unit_price * oi.quantity), 2)::text AS revenue,
       ROUND(SUM(oi.discount), 2)::text AS discount,
       ROUND(SUM(oi.cost_price * oi.quantity), 2)::text AS cost
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE ${IN_RANGE} AND ${COUNTED}
     GROUP BY ${g.group}
     ORDER BY SUM(oi.unit_price * oi.quantity - oi.discount) DESC, 2 ASC
     LIMIT ${ITEM_LIMIT}`,
    ...args
  );

  const figures = rows.map((row) => {
    const revenue = paise(row.revenue);
    const discount = paise(row.discount);
    const cost = paise(row.cost);
    return { row, revenue, discount, cost, profit: revenue - discount - cost };
  });

  const sum = (pick: (f: (typeof figures)[number]) => number) => figures.reduce((total, f) => total + pick(f), 0);
  const totals = {
    quantity: figures.reduce((total, f) => total + f.row.quantity, 0),
    revenue: sum((f) => f.revenue),
    discount: sum((f) => f.discount),
    cost: sum((f) => f.cost),
    profit: sum((f) => f.profit),
  };

  return { range: { from: range.from, to: range.to }, figures, totals, truncated: rows.length >= ITEM_LIMIT };
}

export async function getProductsReport(user: { shopId: string }, query: RangeQuery) {
  const { range, figures, totals, truncated } = await queryItemGroups(user.shopId, query.from, query.to, "product");

  return {
    range,
    truncated,
    rows: figures.map((f) => ({
      id: f.row.id,
      name: f.row.name,
      sku: f.row.sku ?? "",
      category: f.row.category ?? "",
      quantity: f.row.quantity,
      revenue: money(f.revenue),
      discount: money(f.discount),
      cost: money(f.cost),
      profit: money(f.profit),
      marginPercent: percent(f.profit, f.revenue - f.discount),
    })),
    totals: {
      quantity: totals.quantity,
      revenue: money(totals.revenue),
      discount: money(totals.discount),
      cost: money(totals.cost),
      profit: money(totals.profit),
    },
  };
}

export async function getCategoriesReport(user: { shopId: string }, query: RangeQuery) {
  const { range, figures, totals } = await queryItemGroups(user.shopId, query.from, query.to, "category");
  const totalNet = totals.revenue - totals.discount;

  return {
    range,
    rows: figures.map((f) => ({
      id: f.row.id,
      name: f.row.name,
      quantity: f.row.quantity,
      revenue: money(f.revenue),
      discount: money(f.discount),
      cost: money(f.cost),
      profit: money(f.profit),
      sharePercent: percent(f.revenue - f.discount, totalNet),
    })),
    totals: {
      quantity: totals.quantity,
      revenue: money(totals.revenue),
      discount: money(totals.discount),
      cost: money(totals.cost),
      profit: money(totals.profit),
    },
  };
}

// ---------- payments by method ----------

const METHODS = ["CASH", "UPI", "CARD", "OTHER"] as const;

export async function getPaymentsReport(user: { shopId: string }, query: RangeQuery) {
  const { range, args } = window(user.shopId, query.from, query.to);

  const [groups, refunds] = await Promise.all([
    prisma.$queryRawUnsafe<Array<{ method: string; payments: number; total: string }>>(
      `SELECT p.method::text AS method,
         COUNT(*)::int AS payments,
         ROUND(COALESCE(SUM(p.amount), 0), 2)::text AS total
       FROM payments p
       JOIN orders o ON o.id = p.order_id
       WHERE ${IN_RANGE} AND ${COUNTED} AND p.refunded_at IS NULL
       GROUP BY p.method`,
      ...args
    ),
    prisma.$queryRawUnsafe<Array<{ refunds: number; total: string }>>(
      `SELECT COUNT(*)::int AS refunds,
         ROUND(COALESCE(SUM(o.grand_total), 0), 2)::text AS total
       FROM orders o
       WHERE ${IN_RANGE} AND o.payment_status = 'REFUNDED'`,
      ...args
    ),
  ]);

  const amounts = METHODS.map((method) => {
    const group = groups.find((g) => g.method === method);
    return { method, payments: group?.payments ?? 0, total: paise(group?.total ?? "0.00") };
  });
  const collected = amounts.reduce((total, a) => total + a.total, 0);
  const count = amounts.reduce((total, a) => total + a.payments, 0);

  return {
    range: { from: range.from, to: range.to },
    rows: amounts.map((a) => ({
      method: a.method,
      payments: a.payments,
      total: money(a.total),
      sharePercent: percent(a.total, collected),
    })),
    summary: {
      collected: money(collected),
      payments: count,
      refunds: { count: refunds[0]?.refunds ?? 0, total: refunds[0]?.total ?? "0.00" },
    },
  };
}
