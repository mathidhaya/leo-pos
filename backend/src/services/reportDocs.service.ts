import { prisma } from "../config/db";
import type { CellValue, TableColumn, TableDoc } from "../utils/tableDoc";
import type { ExportQuery } from "../validators/report.validators";
import * as reports from "./report.service";

type Row = Record<string, CellValue>;

const PAID_ONLY = "Counts paid orders only. Unpaid, cancelled and refunded orders are not included.";

const METHOD_LABEL: Record<string, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" };

function groupNote(groupBy: string): string {
  return groupBy === "week" ? "Grouped by week (weeks start on Monday)." : `Grouped by ${groupBy}.`;
}

export async function buildReportDoc(user: { shopId: string }, query: ExportQuery): Promise<TableDoc> {
  const shop = await prisma.shop.findUnique({ where: { id: user.shopId }, select: { name: true } });

  const base = {
    shop: shop?.name ?? "Cafe",
    from: query.from,
    to: query.to,
    generatedAt: new Date().toISOString(),
  };
  const range = { from: query.from, to: query.to };
  const trend = { ...range, groupBy: query.groupBy };

  if (query.report === "sales") {
    const data = await reports.getSalesReport(user, trend);
    const s = data.summary;
    const columns: TableColumn[] = [
      { key: "period", label: "Period", type: "text", weight: 2.6 },
      { key: "orders", label: "Orders", type: "int", weight: 1 },
      { key: "revenue", label: "Revenue", type: "money" },
      { key: "discount", label: "Discount", type: "money" },
      { key: "tax", label: "GST", type: "money" },
      { key: "delivery", label: "Delivery", type: "money" },
      { key: "total", label: "Total sales", type: "money" },
      { key: "profit", label: "Profit", type: "money" },
    ];
    return {
      ...base,
      title: "Sales report",
      notes: [PAID_ONLY, groupNote(query.groupBy)],
      summary: [
        { label: "Total sales", value: s.total, type: "money" },
        { label: "Orders", value: s.orders, type: "int" },
        { label: "Profit", value: s.profit, type: "money" },
        { label: "GST collected", value: s.tax, type: "money" },
        { label: "Discounts given", value: s.discount, type: "money" },
        { label: "Average order", value: s.averageOrder, type: "money" },
      ],
      columns,
      rows: data.series.map<Row>((r) => ({
        period: r.label,
        orders: r.orders,
        revenue: r.revenue,
        discount: r.discount,
        tax: r.tax,
        delivery: r.delivery,
        total: r.total,
        profit: r.profit,
      })),
      totals: {
        period: "Total",
        orders: s.orders,
        revenue: s.revenue,
        discount: s.discount,
        tax: s.tax,
        delivery: s.delivery,
        total: s.total,
        profit: s.profit,
      },
    };
  }

  if (query.report === "profit") {
    const data = await reports.getProfitReport(user, trend);
    const s = data.summary;
    return {
      ...base,
      title: "Profit report",
      notes: [PAID_ONLY, "Profit = Revenue - Discount - Cost. Margin = Profit / (Revenue - Discount).", groupNote(query.groupBy)],
      summary: [
        { label: "Revenue", value: s.revenue, type: "money" },
        { label: "Discount", value: s.discount, type: "money" },
        { label: "Net sales", value: s.netSales, type: "money" },
        { label: "GST collected", value: s.tax, type: "money" },
        { label: "Cost", value: s.cost, type: "money" },
        { label: "Profit", value: s.profit, type: "money" },
        { label: "Profit margin", value: s.marginPercent, type: "percent" },
      ],
      columns: [
        { key: "period", label: "Period", type: "text", weight: 2.6 },
        { key: "revenue", label: "Revenue", type: "money" },
        { key: "discount", label: "Discount", type: "money" },
        { key: "cost", label: "Cost", type: "money" },
        { key: "profit", label: "Profit", type: "money" },
        { key: "margin", label: "Margin", type: "percent", weight: 1 },
      ],
      rows: data.series.map<Row>((r) => ({
        period: r.label,
        revenue: r.revenue,
        discount: r.discount,
        cost: r.cost,
        profit: r.profit,
        margin: r.marginPercent,
      })),
      totals: {
        period: "Total",
        revenue: s.revenue,
        discount: s.discount,
        cost: s.cost,
        profit: s.profit,
        margin: s.marginPercent,
      },
    };
  }

  if (query.report === "products") {
    const data = await reports.getProductsReport(user, range);
    const t = data.totals;
    return {
      ...base,
      title: "Product sales report",
      notes: [
        PAID_ONLY,
        "Revenue is before discount and GST. Profit = Revenue - Discount - Cost.",
        ...(data.truncated ? ["Only the top 1000 products are shown."] : []),
      ],
      summary: [
        { label: "Products sold", value: data.rows.length, type: "int" },
        { label: "Units sold", value: t.quantity, type: "int" },
        { label: "Revenue", value: t.revenue, type: "money" },
        { label: "Cost", value: t.cost, type: "money" },
        { label: "Profit", value: t.profit, type: "money" },
      ],
      columns: [
        { key: "name", label: "Product", type: "text", weight: 3 },
        { key: "sku", label: "Code", type: "text", weight: 1.4 },
        { key: "category", label: "Category", type: "text", weight: 1.8 },
        { key: "quantity", label: "Qty sold", type: "int", weight: 1 },
        { key: "revenue", label: "Revenue", type: "money" },
        { key: "discount", label: "Discount", type: "money" },
        { key: "cost", label: "Cost", type: "money" },
        { key: "profit", label: "Profit", type: "money" },
      ],
      rows: data.rows.map<Row>((r) => ({
        name: r.name,
        sku: r.sku,
        category: r.category,
        quantity: r.quantity,
        revenue: r.revenue,
        discount: r.discount,
        cost: r.cost,
        profit: r.profit,
      })),
      totals: {
        name: "Total",
        sku: null,
        category: null,
        quantity: t.quantity,
        revenue: t.revenue,
        discount: t.discount,
        cost: t.cost,
        profit: t.profit,
      },
    };
  }

  if (query.report === "categories") {
    const data = await reports.getCategoriesReport(user, range);
    const t = data.totals;
    return {
      ...base,
      title: "Category sales report",
      notes: [PAID_ONLY, "Share is each category's part of net sales (revenue after discount)."],
      summary: [
        { label: "Units sold", value: t.quantity, type: "int" },
        { label: "Revenue", value: t.revenue, type: "money" },
        { label: "Profit", value: t.profit, type: "money" },
      ],
      columns: [
        { key: "name", label: "Category", type: "text", weight: 3 },
        { key: "quantity", label: "Qty sold", type: "int", weight: 1 },
        { key: "revenue", label: "Revenue", type: "money" },
        { key: "discount", label: "Discount", type: "money" },
        { key: "cost", label: "Cost", type: "money" },
        { key: "profit", label: "Profit", type: "money" },
        { key: "share", label: "Share", type: "percent", weight: 1 },
      ],
      rows: data.rows.map<Row>((r) => ({
        name: r.name,
        quantity: r.quantity,
        revenue: r.revenue,
        discount: r.discount,
        cost: r.cost,
        profit: r.profit,
        share: r.sharePercent,
      })),
      totals: {
        name: "Total",
        quantity: t.quantity,
        revenue: t.revenue,
        discount: t.discount,
        cost: t.cost,
        profit: t.profit,
        share: data.rows.length > 0 ? 100 : null,
      },
    };
  }

  const data = await reports.getPaymentsReport(user, range);
  const s = data.summary;
  return {
    ...base,
    title: "Payment report",
    notes: [PAID_ONLY, "Refunded orders are shown separately and are not part of the amounts below."],
    summary: [
      { label: "Total collected", value: s.collected, type: "money" },
      { label: "Payments", value: s.payments, type: "int" },
      { label: "Refunded amount", value: s.refunds.total, type: "money" },
      { label: "Refunded orders", value: s.refunds.count, type: "int" },
    ],
    columns: [
      { key: "method", label: "Method", type: "text", weight: 2 },
      { key: "payments", label: "Payments", type: "int", weight: 1 },
      { key: "total", label: "Amount", type: "money" },
      { key: "share", label: "Share", type: "percent", weight: 1 },
    ],
    rows: data.rows.map<Row>((r) => ({
      method: METHOD_LABEL[r.method] ?? r.method,
      payments: r.payments,
      total: r.total,
      share: r.sharePercent,
    })),
    totals: {
      method: "Total",
      payments: s.payments,
      total: s.collected,
      share: s.payments > 0 ? 100 : null,
    },
  };
}
