import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { isUniqueViolation } from "../utils/prismaErrors";
import { escapeLike } from "../utils/sql";
import type {
  CustomerInput,
  CustomerOrdersQuery,
  ListCustomersQuery,
} from "../validators/customer.validators";
import { logAudit, type RequestContext } from "./audit.service";

type Actor = { id: string; shopId: string; role: RoleName };

// How the list can be sorted. These are fixed pieces of SQL picked from this list,
// never text that comes from the user.
const SORTS = {
  name: "LOWER(c.name) ASC",
  recent: "s.last_order DESC NULLS LAST, LOWER(c.name) ASC",
  orders: "COALESCE(s.orders, 0) DESC, LOWER(c.name) ASC",
  spent: "COALESCE(s.spent, 0) DESC, LOWER(c.name) ASC",
  newest: "c.created_at DESC",
} as const;

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  createdAt: Date;
  orders: number;
  spent: string;
  lastOrderAt: Date | null;
}

function toDto(row: CustomerRow) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    createdAt: row.createdAt.toISOString(),
    orders: row.orders,
    spent: row.spent,
    lastOrderAt: row.lastOrderAt ? row.lastOrderAt.toISOString() : null,
  };
}

const notFound = () => new AppError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");

const phoneTaken = (name?: string) =>
  new AppError(
    409,
    "PHONE_EXISTS",
    `A customer with this mobile number already exists${name ? ` (${name})` : ""}.`
  );

// One query gives each customer together with their numbers. Every value reaches the
// database as a bound parameter ($1, $2, ...). Only fixed SQL text and parameter numbers are joined.
async function queryCustomers(
  shopId: string,
  opts: { id?: string; q?: string; sort: ListCustomersQuery["sort"]; limit: number; offset: number }
) {
  const params: unknown[] = [shopId];
  const conditions = ["c.shop_id = $1::uuid"];
  let statsFilter = "";

  if (opts.id) {
    params.push(opts.id);
    conditions.push(`c.id = $${params.length}::uuid`);
    statsFilter = ` AND o.customer_id = $${params.length}::uuid`;
  }

  if (opts.q) {
    params.push(`%${escapeLike(opts.q)}%`);
    const text = `$${params.length}`;
    let clause = `c.name ILIKE ${text} OR c.email ILIKE ${text}`;

    // Typing part of a phone number (3 digits or more) finds it
    const digits = opts.q.replace(/\D/g, "");
    if (digits.length >= 3) {
      params.push(`%${digits}%`);
      clause += ` OR c.phone LIKE $${params.length}`;
    }
    conditions.push(`(${clause})`);
  }

  const where = conditions.join(" AND ");
  const filterParams = [...params];

  params.push(opts.limit, opts.offset);
  const limitParam = `$${params.length - 1}::int`;
  const offsetParam = `$${params.length}::int`;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRawUnsafe<CustomerRow[]>(
      `WITH stats AS (
         SELECT o.customer_id,
           (COUNT(*) FILTER (WHERE o.status <> 'CANCELLED'))::int AS orders,
           COALESCE(SUM(o.grand_total) FILTER (WHERE o.status <> 'CANCELLED' AND o.payment_status = 'PAID'), 0) AS spent,
           MAX(o.created_at) FILTER (WHERE o.status <> 'CANCELLED') AS last_order
         FROM orders o
         WHERE o.shop_id = $1::uuid AND o.customer_id IS NOT NULL${statsFilter}
         GROUP BY o.customer_id
       )
       SELECT c.id, c.name, c.phone, c.email, c.address,
         c.created_at AS "createdAt",
         COALESCE(s.orders, 0)::int AS "orders",
         ROUND(COALESCE(s.spent, 0), 2)::text AS "spent",
         s.last_order AS "lastOrderAt"
       FROM customers c
       LEFT JOIN stats s ON s.customer_id = c.id
       WHERE ${where}
       ORDER BY ${SORTS[opts.sort]}, c.id ASC
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      ...params
    ),
    prisma.$queryRawUnsafe<Array<{ total: number }>>(
      `SELECT COUNT(*)::int AS total FROM customers c WHERE ${where}`,
      ...filterParams
    ),
  ]);

  return { rows: rows.map(toDto), total: countRows[0]?.total ?? 0 };
}

async function loadCustomer(shopId: string, id: string) {
  const { rows } = await queryCustomers(shopId, { id, sort: "name", limit: 1, offset: 0 });
  if (rows.length === 0) throw notFound();
  return rows[0];
}

export function getCustomer(user: Actor, id: string) {
  return loadCustomer(user.shopId, id);
}

// ---------- list ----------

export async function listCustomers(user: Actor, query: ListCustomersQuery) {
  const { rows, total } = await queryCustomers(user.shopId, {
    q: query.q,
    sort: query.sort,
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  });

  return {
    items: rows,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ---------- order history of one customer ----------

export async function listCustomerOrders(user: Actor, id: string, query: CustomerOrdersQuery) {
  const exists = await prisma.customer.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true },
  });
  if (!exists) throw notFound();

  const where = { shopId: user.shopId, customerId: id };

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        orderNo: true,
        createdAt: true,
        orderType: true,
        status: true,
        paymentStatus: true,
        grandTotal: true,
        payments: { select: { method: true }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      orderNo: row.orderNo,
      createdAt: row.createdAt.toISOString(),
      orderType: row.orderType,
      status: row.status,
      paymentStatus: row.paymentStatus,
      amount: row.grandTotal.toFixed(2),
      paymentMethod: row.payments[0]?.method ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ---------- create / update / delete ----------

export async function createCustomer(user: Actor, input: CustomerInput, ctx: RequestContext) {
  const clash = await prisma.customer.findUnique({
    where: { shopId_phone: { shopId: user.shopId, phone: input.phone } },
    select: { name: true },
  });
  if (clash) throw phoneTaken(clash.name);

  try {
    const created = await prisma.customer.create({
      data: {
        shopId: user.shopId,
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
      },
      select: { id: true },
    });

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "CUSTOMER_CREATED",
        entity: "customer",
        entityId: created.id,
        details: { name: input.name },
      },
      ctx
    );
    return loadCustomer(user.shopId, created.id);
  } catch (err) {
    // Two people adding the same number at the same moment
    if (isUniqueViolation(err)) throw phoneTaken();
    throw err;
  }
}

export async function updateCustomer(user: Actor, id: string, input: CustomerInput, ctx: RequestContext) {
  const existing = await prisma.customer.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true },
  });
  if (!existing) throw notFound();

  const clash = await prisma.customer.findFirst({
    where: { shopId: user.shopId, phone: input.phone, id: { not: id } },
    select: { name: true },
  });
  if (clash) throw phoneTaken(clash.name);

  try {
    await prisma.customer.update({
      where: { id },
      data: {
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        address: input.address ?? null,
      },
    });

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "CUSTOMER_UPDATED",
        entity: "customer",
        entityId: id,
        details: { name: input.name },
      },
      ctx
    );
    return loadCustomer(user.shopId, id);
  } catch (err) {
    if (isUniqueViolation(err)) throw phoneTaken();
    throw err;
  }
}

// Deleting a customer never deletes sales. Their orders stay, and the customer's name is copied
// onto each order first, so orders, payments and invoices keep showing who it was.
export async function deleteCustomer(user: Actor, id: string, ctx: RequestContext) {
  const customer = await prisma.customer.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true, name: true, _count: { select: { orders: true } } },
  });
  if (!customer) throw notFound();

  await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { shopId: user.shopId, customerId: id, walkInName: null },
      data: { walkInName: customer.name },
    });
    await tx.customer.delete({ where: { id } });
  });

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: "CUSTOMER_DELETED",
      entity: "customer",
      entityId: id,
      details: { name: customer.name, orders: customer._count.orders },
    },
    ctx
  );

  return { ordersKept: customer._count.orders };
}
