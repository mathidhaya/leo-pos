import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { paiseToDecimalString } from "../utils/billing";
import { resolveRange } from "../utils/dateRange";
import { formatOrderNo } from "../utils/orderNumber";
import { allowedNextStatuses, type OrderStatusName } from "../utils/orderStatus";
import { normalizePhone } from "../utils/phone";
import { isUniqueViolation } from "../utils/prismaErrors";
import type { CreateOrderInput, ListOrdersQuery } from "../validators/order.validators";
import { logAudit, type RequestContext } from "./audit.service";
import { prepareOrder } from "./pos.service";

type Actor = { id: string; shopId: string; role: RoleName };

const orderInclude = {
  customer: { select: { name: true, phone: true } },
  createdBy: { select: { name: true } },
  items: { orderBy: [{ nameSnapshot: "asc" }, { id: "asc" }] },
  payments: { select: { method: true, amount: true, refundedAt: true }, orderBy: { createdAt: "asc" } },
  invoice: { select: { id: true, invoiceNo: true } },
} satisfies Prisma.OrderInclude;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

// Only the owner and managers may cancel an order that was already paid (which refunds it)
const canRefund = (user: Actor) => user.role === "OWNER" || user.role === "MANAGER";

// What the browser receives. Cost prices are never included.
function toDetail(order: OrderRow, refundAllowed: boolean) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    createdAt: order.createdAt.toISOString(),
    orderType: order.orderType,
    tableNo: order.tableNo,
    guests: order.guests,
    deliveryAddress: order.deliveryAddress,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerName: order.customer?.name ?? order.walkInName ?? null,
    customerPhone: order.customer?.phone ?? null,
    cashier: order.createdBy.name,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      gstPercent: item.gstPercent.toFixed(2),
      discount: item.discount.toFixed(2),
      tax: item.taxAmount.toFixed(2),
      total: item.lineTotal.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    discount: order.discount.toFixed(2),
    tax: order.tax.toFixed(2),
    deliveryCharge: order.deliveryCharge.toFixed(2),
    grandTotal: order.grandTotal.toFixed(2),
    payments: order.payments.map((payment) => ({
      method: payment.method,
      amount: payment.amount.toFixed(2),
      refundedAt: payment.refundedAt ? payment.refundedAt.toISOString() : null,
    })),
    invoiceId: order.invoice?.id ?? null,
    invoiceNo: order.invoice?.invoiceNo ?? null,
    canPay: order.paymentStatus === "UNPAID" && order.status !== "CANCELLED",
    // The server decides which status buttons make sense for this person
    actions: allowedNextStatuses(order.status, order.paymentStatus, refundAllowed),
  };
}

async function loadOrder(user: Actor, id: string) {
  const order = await prisma.order.findFirst({ where: { id, shopId: user.shopId }, include: orderInclude });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
  return toDetail(order, canRefund(user));
}

export function getOrder(user: Actor, id: string) {
  return loadOrder(user, id);
}

// ---------- list ----------

export async function listOrders(user: Actor, query: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = { shopId: user.shopId };

  if (query.from && query.to) {
    const range = resolveRange({ range: "custom", from: query.from, to: query.to });
    where.createdAt = { gte: range.start, lt: range.end };
  }
  if (query.status !== "all") where.status = query.status;
  if (query.orderType !== "all") where.orderType = query.orderType;

  if (query.payment === "UNPAID") {
    where.paymentStatus = "UNPAID";
  } else if (query.payment !== "all") {
    where.payments = { some: { method: query.payment } };
  }

  if (query.q) {
    // Matches the order number (123 or #000123), the customer name, or part of the phone number
    const text = query.q.replace(/^#/, "");
    const digits = query.q.replace(/\D/g, "");
    const or: Prisma.OrderWhereInput[] = [
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { walkInName: { contains: query.q, mode: "insensitive" } },
    ];
    if (/^\d{1,9}$/.test(text)) or.push({ orderNo: Number(text) });
    if (digits.length >= 3) or.push({ customer: { phone: { contains: digits } } });
    where.OR = or;
  }

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
        tableNo: true,
        status: true,
        paymentStatus: true,
        grandTotal: true,
        walkInName: true,
        customer: { select: { name: true, phone: true } },
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
      tableNo: row.tableNo,
      status: row.status,
      paymentStatus: row.paymentStatus,
      amount: row.grandTotal.toFixed(2),
      customerName: row.customer?.name ?? row.walkInName ?? null,
      customerPhone: row.customer?.phone ?? null,
      paymentMethod: row.payments[0]?.method ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

// ---------- create ----------

async function findByKey(shopId: string, key: string) {
  return prisma.order.findFirst({ where: { shopId, idempotencyKey: key }, select: { id: true } });
}

// Everything in here is saved together, or nothing is saved at all.
async function placeOrder(tx: Prisma.TransactionClient, user: Actor, input: CreateOrderInput): Promise<string> {
  // 1. Take the next order number. This locks the shop's counter row until the order is saved,
  //    so two cashiers can never get the same number (and it also prevents deadlocks).
  const counter = await tx.settings.update({
    where: { shopId: user.shopId },
    data: { nextOrderNumber: { increment: 1 } },
    select: { nextOrderNumber: true },
  });
  const orderNo = counter.nextOrderNumber - 1;

  // 2. Check the products and calculate the bill (the same code as the quote)
  const { ordered, wanted, bill } = await prepareOrder(tx, user.shopId, input);

  // 3. The cashier must have seen exactly this total
  if (paiseToDecimalString(bill.grandTotalPaise) !== input.expectedTotal) {
    throw new AppError(
      409,
      "TOTAL_CHANGED",
      "Prices changed while the order was being checked. Please review the order and try again."
    );
  }

  // 4. Customer
  const isDineIn = input.orderType === "DINE_IN";
  const isDelivery = input.orderType === "DELIVERY";
  const typedName = (input.customerName ?? "").trim();
  const phone = input.customerPhone ? normalizePhone(input.customerPhone) : null;

  let customerId: string | null = null;
  let walkInName: string | null = null;

  if (!isDineIn) {
    if (phone) {
      const customer = await tx.customer.upsert({
        where: { shopId_phone: { shopId: user.shopId, phone } },
        update: {},
        create: {
          shopId: user.shopId,
          phone,
          name: typedName || "Guest",
          address: isDelivery ? (input.address ?? null) : null,
        },
        select: { id: true },
      });
      customerId = customer.id;
    } else if (typedName) {
      walkInName = typedName;
    }
  }

  // 5. The order and its lines. Names and prices are copied, so old bills never change.
  const order = await tx.order.create({
    data: {
      shopId: user.shopId,
      orderNo,
      customerId,
      walkInName,
      orderType: input.orderType,
      tableNo: isDineIn ? input.tableNo || null : null,
      guests: isDineIn ? (input.guests ?? null) : null,
      deliveryAddress: isDelivery ? (input.address ?? null) : null,
      subtotal: paiseToDecimalString(bill.subtotalPaise),
      discount: paiseToDecimalString(bill.discountPaise),
      tax: paiseToDecimalString(bill.taxPaise),
      deliveryCharge: paiseToDecimalString(bill.deliveryChargePaise),
      grandTotal: paiseToDecimalString(bill.grandTotalPaise),
      idempotencyKey: input.idempotencyKey,
      createdById: user.id,
      items: {
        create: ordered.map((product, index) => {
          const line = bill.lines[index];
          return {
            productId: product.id,
            nameSnapshot: product.name,
            unitPrice: product.sellingPrice.toFixed(2),
            costPrice: product.costPrice.toFixed(2),
            gstPercent: product.gstPercent.toFixed(2),
            quantity: wanted.get(product.id)!,
            discount: paiseToDecimalString(line.discountPaise),
            taxAmount: paiseToDecimalString(line.taxPaise),
            lineTotal: paiseToDecimalString(line.totalPaise),
          };
        }),
      },
    },
    select: { id: true },
  });

  // 6. Take the stock. "quantity >= wanted" is checked and changed in one step, so the
  //    last cup can only be sold once, even if two cashiers press the button together.
  const inIdOrder = [...ordered].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const product of inIdOrder) {
    const quantity = wanted.get(product.id)!;
    const updated = await tx.inventory.updateMany({
      where: { productId: product.id, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (updated.count === 0) {
      throw new AppError(
        422,
        "CART_UNAVAILABLE",
        `"${product.name}" does not have enough stock any more. Please check the order and try again.`
      );
    }
  }

  // 7. Stock history
  await tx.inventoryTransaction.createMany({
    data: ordered.map((product) => ({
      productId: product.id,
      type: "SALE" as const,
      quantityChange: -wanted.get(product.id)!,
      reason: `Order ${formatOrderNo(orderNo)}`,
      userId: user.id,
      orderId: order.id,
    })),
  });

  return order.id;
}

export async function createOrder(user: Actor, input: CreateOrderInput, ctx: RequestContext) {
  // The same request arriving twice (double-click, retry) returns the first order
  const known = await findByKey(user.shopId, input.idempotencyKey);
  if (known) return { order: await loadOrder(user, known.id), duplicate: true };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const orderId = await prisma.$transaction((tx) => placeOrder(tx, user, input), { timeout: 15000 });
      const order = await loadOrder(user, orderId);

      await logAudit(
        {
          shopId: user.shopId,
          userId: user.id,
          action: "ORDER_CREATED",
          entity: "order",
          entityId: orderId,
          details: { orderNo: order.orderNo, total: order.grandTotal, type: order.orderType },
        },
        ctx
      );
      return { order, duplicate: false };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      // Someone saved the same request a moment ago, or two requests created the same new customer
      const raced = await findByKey(user.shopId, input.idempotencyKey);
      if (raced) return { order: await loadOrder(user, raced.id), duplicate: true };
      if (attempt === 2) throw err;
    }
  }

  throw new AppError(503, "ORDER_FAILED", "The order could not be saved. Please try again.");
}

// ---------- status ----------

export async function updateStatus(user: Actor, id: string, next: OrderStatusName, ctx: RequestContext) {
  const order = await prisma.order.findFirst({
    where: { id, shopId: user.shopId },
    select: { id: true, orderNo: true, status: true, paymentStatus: true },
  });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");

  if (order.status === next) return loadOrder(user, id);

  if (!allowedNextStatuses(order.status, order.paymentStatus, canRefund(user)).includes(next)) {
    const stillOpen = order.status !== "COMPLETED" && order.status !== "CANCELLED";
    if (next === "CANCELLED" && stillOpen && order.paymentStatus === "PAID") {
      throw new AppError(
        403,
        "REFUND_NOT_ALLOWED",
        "Only the owner or a manager can cancel a paid order and refund it."
      );
    }
    throw new AppError(
      409,
      "INVALID_STATUS_CHANGE",
      `A ${order.status.toLowerCase()} order cannot be changed to ${next.toLowerCase()}.`
    );
  }

  // Cancelling a paid order is a refund
  const isRefund = next === "CANCELLED" && order.paymentStatus === "PAID";

  await prisma.$transaction(async (tx) => {
    // Claim the change. If someone else changed this order meanwhile (for example it was just
    // paid), nothing matches and we stop.
    const claimed = await tx.order.updateMany({
      where: {
        id,
        shopId: user.shopId,
        status: order.status,
        ...(next === "CANCELLED" ? { paymentStatus: order.paymentStatus } : {}),
      },
      data: { status: next, ...(isRefund ? { paymentStatus: "REFUNDED" as const } : {}) },
    });
    if (claimed.count === 0) {
      throw new AppError(409, "ORDER_CHANGED", "This order was just changed by someone else. Please check it again.");
    }

    if (isRefund) {
      await tx.payment.updateMany({
        where: { orderId: id, refundedAt: null },
        data: { refundedAt: new Date() },
      });
    }

    if (next === "CANCELLED") {
      // Give back exactly what this order took from stock
      const sales = await tx.inventoryTransaction.findMany({
        where: { orderId: id, type: "SALE" },
        orderBy: { productId: "asc" },
      });
      for (const sale of sales) {
        const quantity = -sale.quantityChange;
        if (quantity <= 0) continue;

        await tx.inventory.updateMany({
          where: { productId: sale.productId },
          data: { quantity: { increment: quantity } },
        });
        await tx.inventoryTransaction.create({
          data: {
            productId: sale.productId,
            type: "IN",
            quantityChange: quantity,
            reason: `Order ${formatOrderNo(order.orderNo)} cancelled`,
            userId: user.id,
            orderId: id,
          },
        });
      }
    }
  });

  await logAudit(
    {
      shopId: user.shopId,
      userId: user.id,
      action: isRefund ? "ORDER_REFUNDED" : next === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS_CHANGED",
      entity: "order",
      entityId: id,
      details: { orderNo: order.orderNo, from: order.status, to: next },
    },
    ctx
  );

  return loadOrder(user, id);
}
