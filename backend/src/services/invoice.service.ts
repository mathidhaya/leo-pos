import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../config/db";
import type { RoleName } from "../types/auth";
import type { InvoiceData } from "../types/invoice";
import { AppError } from "../utils/AppError";
import { paiseToDecimalString } from "../utils/billing";
import { resolveRange } from "../utils/dateRange";
import { decimalTextToPaise } from "../utils/paymentCalc";
import type { ListInvoicesQuery } from "../validators/payment.validators";

type Actor = { id: string; shopId: string; role: RoleName };

const invoiceInclude = {
  shop: {
    select: {
      name: true,
      address: true,
      phone: true,
      email: true,
      gstNumber: true,
      settings: { select: { receiptFooter: true, showGst: true, showCashier: true } },
    },
  },
  order: {
    include: {
      items: { orderBy: [{ nameSnapshot: "asc" }, { id: "asc" }] },
      payments: { orderBy: { createdAt: "asc" }, include: { createdBy: { select: { name: true } } } },
      customer: { select: { name: true, phone: true } },
      createdBy: { select: { name: true } },
    },
  },
} satisfies Prisma.InvoiceInclude;

export async function getInvoice(user: Actor, id: string): Promise<InvoiceData> {
  const invoice = await prisma.invoice.findFirst({
    where: { id, shopId: user.shopId },
    include: invoiceInclude,
  });
  if (!invoice) throw new AppError(404, "INVOICE_NOT_FOUND", "Invoice not found.");

  const { order, shop } = invoice;
  const payment = order.payments.find((p) => !p.refundedAt) ?? order.payments[order.payments.length - 1];

  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    issuedAt: invoice.issuedAt.toISOString(),
    voided: order.status === "CANCELLED",
    shop: {
      name: shop.name,
      address: shop.address,
      phone: shop.phone,
      email: shop.email,
      gstNumber: shop.gstNumber,
    },
    settings: {
      footer: shop.settings?.receiptFooter ?? "Thank you for visiting Leo Cafe!",
      showGst: shop.settings?.showGst ?? true,
      showCashier: shop.settings?.showCashier ?? true,
    },
    order: {
      id: order.id,
      orderNo: order.orderNo,
      orderType: order.orderType,
      tableNo: order.tableNo,
      guests: order.guests,
      deliveryAddress: order.deliveryAddress,
    },
    customer: order.customer
      ? { name: order.customer.name, phone: order.customer.phone }
      : order.walkInName
        ? { name: order.walkInName, phone: null }
        : null,
    cashier: payment?.createdBy.name ?? order.createdBy.name,
    items: order.items.map((item) => ({
      name: item.nameSnapshot,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      amount: paiseToDecimalString(decimalTextToPaise(item.unitPrice.toFixed(2)) * item.quantity),
      gstPercent: item.gstPercent.toFixed(2),
      discount: item.discount.toFixed(2),
    })),
    subtotal: order.subtotal.toFixed(2),
    discount: order.discount.toFixed(2),
    tax: order.tax.toFixed(2),
    deliveryCharge: order.deliveryCharge.toFixed(2),
    grandTotal: order.grandTotal.toFixed(2),
    payment: payment
      ? {
          method: payment.method,
          amount: payment.amount.toFixed(2),
          amountReceived: payment.amountReceived ? payment.amountReceived.toFixed(2) : null,
          changeGiven: payment.changeGiven.toFixed(2),
        }
      : null,
  };
}

export async function listInvoices(user: Actor, query: ListInvoicesQuery) {
  const where: Prisma.InvoiceWhereInput = { shopId: user.shopId };

  if (query.from && query.to) {
    const range = resolveRange({ range: "custom", from: query.from, to: query.to });
    where.issuedAt = { gte: range.start, lt: range.end };
  }

  if (query.q) {
    const text = query.q.replace(/^#/, "");
    const digits = query.q.replace(/\D/g, "");
    const or: Prisma.InvoiceWhereInput[] = [
      { invoiceNo: { contains: query.q, mode: "insensitive" } },
      { order: { customer: { name: { contains: query.q, mode: "insensitive" } } } },
      { order: { walkInName: { contains: query.q, mode: "insensitive" } } },
    ];
    if (/^\d{1,9}$/.test(text)) or.push({ order: { orderNo: Number(text) } });
    if (digits.length >= 3) or.push({ order: { customer: { phone: { contains: digits } } } });
    where.OR = or;
  }

  const [total, rows] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        invoiceNo: true,
        issuedAt: true,
        order: {
          select: {
            orderNo: true,
            grandTotal: true,
            status: true,
            walkInName: true,
            customer: { select: { name: true } },
            payments: { select: { method: true }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      invoiceNo: row.invoiceNo,
      issuedAt: row.issuedAt.toISOString(),
      orderNo: row.order.orderNo,
      customerName: row.order.customer?.name ?? row.order.walkInName ?? null,
      total: row.order.grandTotal.toFixed(2),
      paymentMethod: row.order.payments[0]?.method ?? null,
      voided: row.order.status === "CANCELLED",
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
