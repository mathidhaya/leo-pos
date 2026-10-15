import { escapeLike } from "../utils/sql";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import { AppError } from "../utils/AppError";
import { paiseToDecimalString } from "../utils/billing";
import { resolveRange } from "../utils/dateRange";
import { calculatePayment, decimalTextToPaise } from "../utils/paymentCalc";
import { isUniqueViolation } from "../utils/prismaErrors";
import type { CreatePaymentInput, ListPaymentsQuery } from "../validators/payment.validators";
import { logAudit, type RequestContext } from "./audit.service";

type Actor = { id: string; shopId: string; role: RoleName };

const resultSelect = {
  id: true,
  orderId: true,
  method: true,
  amount: true,
  amountReceived: true,
  changeGiven: true,
  order: {
    select: { orderNo: true, shopId: true, invoice: { select: { id: true, invoiceNo: true } } },
  },
} satisfies Prisma.PaymentSelect;

type ResultRow = Prisma.PaymentGetPayload<{ select: typeof resultSelect }>;

function toResult(row: ResultRow) {
  return {
    paymentId: row.id,
    orderId: row.orderId,
    orderNo: row.order.orderNo,
    method: row.method,
    amount: row.amount.toFixed(2),
    amountReceived: row.amountReceived ? row.amountReceived.toFixed(2) : null,
    changeGiven: row.changeGiven.toFixed(2),
    invoiceId: row.order.invoice?.id ?? null,
    invoiceNo: row.order.invoice?.invoiceNo ?? null,
  };
}

// The same request key arriving again returns the payment that was already saved
async function findKnown(user: Actor, input: CreatePaymentInput) {
  const row = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: resultSelect,
  });
  if (!row) return null;

  if (row.order.shopId !== user.shopId || row.orderId !== input.orderId) {
    throw new AppError(409, "KEY_REUSED", "This payment request was already used. Please try again.");
  }
  return toResult(row);
}

export async function createPayment(user: Actor, input: CreatePaymentInput, ctx: RequestContext) {
  const known = await findKnown(user, input);
  if (known) return { result: known, duplicate: true };

  try {
    // Everything in here is saved together, or nothing is saved at all
    const saved = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findFirst({
          where: { id: input.orderId, shopId: user.shopId },
          select: { id: true, orderNo: true, status: true, paymentStatus: true, grandTotal: true },
        });
        if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found.");
        if (order.status === "CANCELLED") {
          throw new AppError(409, "ORDER_CANCELLED", "This order was cancelled, so it cannot be paid.");
        }
        if (order.paymentStatus !== "UNPAID") {
          throw new AppError(409, "ALREADY_PAID", "This order has already been paid.");
        }

        // The amount is always the order's saved total, never a number from the browser
        const totalPaise = decimalTextToPaise(order.grandTotal.toFixed(2));
        const calc = calculatePayment(input.method, totalPaise, input.amountReceived);
        if (!calc.ok) throw new AppError(400, "INVALID_PAYMENT", calc.error);

        // Claim the order. Only one request can ever change it from UNPAID to PAID.
        const claimed = await tx.order.updateMany({
          where: { id: order.id, shopId: user.shopId, paymentStatus: "UNPAID", status: { not: "CANCELLED" } },
          data: { paymentStatus: "PAID" },
        });
        if (claimed.count === 0) {
          throw new AppError(409, "ORDER_CHANGED", "This order was just changed by someone else. Please check it again.");
        }

        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            method: input.method,
            amount: paiseToDecimalString(totalPaise),
            amountReceived: calc.receivedPaise === null ? null : paiseToDecimalString(calc.receivedPaise),
            changeGiven: paiseToDecimalString(calc.changePaise),
            idempotencyKey: input.idempotencyKey,
            createdById: user.id,
          },
          select: { id: true },
        });

        // Take the next invoice number. This locks the counter row until the payment is saved.
        const settings = await tx.settings.update({
          where: { shopId: user.shopId },
          data: { nextInvoiceNumber: { increment: 1 } },
          select: { invoicePrefix: true, nextInvoiceNumber: true },
        });
        const invoiceNo = `${settings.invoicePrefix}-${String(settings.nextInvoiceNumber - 1).padStart(6, "0")}`;
        await tx.invoice.create({ data: { shopId: user.shopId, orderId: order.id, invoiceNo } });

        return { paymentId: payment.id, orderNo: order.orderNo, invoiceNo, amount: paiseToDecimalString(totalPaise) };
      },
      { timeout: 15000 }
    );

    const row = await prisma.payment.findUniqueOrThrow({ where: { id: saved.paymentId }, select: resultSelect });

    await logAudit(
      {
        shopId: user.shopId,
        userId: user.id,
        action: "PAYMENT_COMPLETED",
        entity: "payment",
        entityId: saved.paymentId,
        details: { orderNo: saved.orderNo, method: input.method, amount: saved.amount, invoiceNo: saved.invoiceNo },
      },
      ctx
    );
    return { result: toResult(row), duplicate: false };
  } catch (err) {
    // Two identical requests at the same moment: the second one gets the first one's payment
    if (
      isUniqueViolation(err) ||
      (err instanceof AppError && (err.code === "ORDER_CHANGED" || err.code === "ALREADY_PAID"))
    ) {
      const raced = await findKnown(user, input);
      if (raced) return { result: raced, duplicate: true };
    }
    throw err;
  }
}

// ---------- list ----------

function paymentWhere(user: Actor, query: ListPaymentsQuery): Prisma.PaymentWhereInput {
  const where: Prisma.PaymentWhereInput = { order: { shopId: user.shopId } };

  if (query.from && query.to) {
    const range = resolveRange({ range: "custom", from: query.from, to: query.to });
    where.createdAt = { gte: range.start, lt: range.end };
  }
  if (query.method !== "all") where.method = query.method;

  if (query.q) {
    // Matches the invoice number, order number (123 or #000123), customer name, or part of the phone number
    const text = query.q.replace(/^#/, "");
    const digits = query.q.replace(/\D/g, "");
    const or: Prisma.PaymentWhereInput[] = [
      { order: { invoice: { invoiceNo: { contains: escapeLike(query.q), mode: "insensitive" } } } },
      { order: { customer: { name: { contains: escapeLike(query.q), mode: "insensitive" } } } },
      { order: { walkInName: { contains: escapeLike(query.q), mode: "insensitive" } } },
    ];
    if (/^\d{1,9}$/.test(text)) or.push({ order: { orderNo: Number(text) } });
    if (digits.length >= 3) or.push({ order: { customer: { phone: { contains: digits } } } });
    where.OR = or;
  }
  return where;
}

const METHODS = ["CASH", "UPI", "CARD", "OTHER"] as const;

export async function listPayments(user: Actor, query: ListPaymentsQuery) {
  const where = paymentWhere(user, query);

  const [total, rows, groups, refunded] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        createdAt: true,
        method: true,
        amount: true,
        amountReceived: true,
        changeGiven: true,
        refundedAt: true,
        createdBy: { select: { name: true } },
        order: {
          select: {
            id: true,
            orderNo: true,
            walkInName: true,
            customer: { select: { name: true } },
            invoice: { select: { id: true, invoiceNo: true } },
          },
        },
      },
    }),
    prisma.payment.groupBy({
      by: ["method"],
      where: { ...where, refundedAt: null },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.payment.aggregate({
      where: { ...where, refundedAt: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const byMethod = METHODS.map((method) => {
    const group = groups.find((g) => g.method === method);
    return {
      method,
      count: group?._count._all ?? 0,
      total: group?._sum.amount ? group._sum.amount.toFixed(2) : "0.00",
    };
  });
  const collectedPaise = byMethod.reduce((sum, m) => sum + decimalTextToPaise(m.total), 0);

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      orderId: row.order.id,
      orderNo: row.order.orderNo,
      customerName: row.order.customer?.name ?? row.order.walkInName ?? null,
      method: row.method,
      amount: row.amount.toFixed(2),
      amountReceived: row.amountReceived ? row.amountReceived.toFixed(2) : null,
      changeGiven: row.changeGiven.toFixed(2),
      cashier: row.createdBy.name,
      refundedAt: row.refundedAt ? row.refundedAt.toISOString() : null,
      invoiceId: row.order.invoice?.id ?? null,
      invoiceNo: row.order.invoice?.invoiceNo ?? null,
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    summary: {
      byMethod,
      collected: paiseToDecimalString(collectedPaise),
      refunded: {
        count: refunded._count._all,
        total: refunded._sum.amount ? refunded._sum.amount.toFixed(2) : "0.00",
      },
    },
  };
}
