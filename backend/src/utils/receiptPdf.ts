import PDFDocument from "pdfkit";
import type { InvoiceData } from "../types/invoice";

// An 80 mm thermal-paper receipt. The standard PDF fonts have no rupee sign, so amounts say "Rs.".
const PAGE_WIDTH = 226.77; // 80 mm in points
const MARGIN = 12;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const TZ = "Asia/Kolkata";

type Doc = InstanceType<typeof PDFDocument>;

const TYPE_LABEL = { DINE_IN: "Dine In", TAKE_AWAY: "Take Away", DELIVERY: "Delivery" } as const;
const METHOD_LABEL = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" } as const;

const money = (value: string) =>
  Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = (value: string) => `Rs. ${money(value)}`;
const orderNumber = (n: number) => `#${String(n).padStart(6, "0")}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });

// Draws the whole receipt and returns how tall it turned out to be.
function draw(doc: Doc, d: InvoiceData): number {
  let y = 14;

  const setFont = (bold: boolean, size: number) => doc.font(bold ? "Courier-Bold" : "Courier").fontSize(size);

  const text = (
    value: string,
    o: { bold?: boolean; size?: number; align?: "left" | "center" | "right"; gap?: number } = {}
  ) => {
    setFont(o.bold ?? false, o.size ?? 8);
    const opts = { width: CONTENT_WIDTH, align: o.align ?? "left" } as const;
    doc.text(value, MARGIN, y, opts);
    y += doc.heightOfString(value, opts) + (o.gap ?? 2);
  };

  const pair = (left: string, right: string, o: { bold?: boolean; size?: number } = {}) => {
    setFont(o.bold ?? false, o.size ?? 8);
    const rightWidth = doc.widthOfString(right) + 4;
    const leftOpts = { width: CONTENT_WIDTH - rightWidth };
    const height = Math.max(doc.heightOfString(left, leftOpts), doc.heightOfString(right, { width: rightWidth }));
    doc.text(left, MARGIN, y, leftOpts);
    doc.text(right, MARGIN + CONTENT_WIDTH - rightWidth, y, { width: rightWidth, align: "right" });
    y += height + 1;
  };

  const rule = () => {
    doc
      .save()
      .lineWidth(0.5)
      .dash(2, { space: 2 })
      .moveTo(MARGIN, y + 2)
      .lineTo(PAGE_WIDTH - MARGIN, y + 2)
      .stroke()
      .undash()
      .restore();
    y += 8;
  };

  // Product | Qty | Price | Total
  const NAME_W = 88;
  const QTY_X = MARGIN + 92;
  const PRICE_X = MARGIN + 112;
  const TOTAL_X = MARGIN + 154;
  const itemRow = (name: string, qty: string, price: string, total: string, bold = false) => {
    setFont(bold, 8);
    const height = doc.heightOfString(name, { width: NAME_W });
    doc.text(name, MARGIN, y, { width: NAME_W });
    doc.text(qty, QTY_X, y, { width: 16, align: "center" });
    doc.text(price, PRICE_X, y, { width: 40, align: "right" });
    doc.text(total, TOTAL_X, y, { width: CONTENT_WIDTH - 154, align: "right" });
    y += height + 2;
  };

  text(d.shop.name.toUpperCase(), { bold: true, size: 12, align: "center", gap: 3 });
  if (d.shop.address) text(d.shop.address, { align: "center" });
  if (d.shop.phone) text(`Phone: ${d.shop.phone}`, { align: "center" });
  if (d.settings.showGst && d.shop.gstNumber) text(`GSTIN: ${d.shop.gstNumber}`, { align: "center" });
  rule();

  if (d.voided) text("*** CANCELLED / REFUNDED ***", { bold: true, align: "center", gap: 4 });

  pair("Invoice No:", d.invoiceNo, { bold: true });
  pair("Date:", fmtDate(d.issuedAt));
  pair("Time:", fmtTime(d.issuedAt));
  if (d.settings.showCashier) pair("Cashier:", d.cashier);
  pair("Order:", orderNumber(d.order.orderNo));
  pair(
    "Type:",
    `${TYPE_LABEL[d.order.orderType]}${d.order.tableNo ? `, table ${d.order.tableNo}` : ""}`
  );
  if (d.customer) {
    text(`Customer: ${d.customer.name}${d.customer.phone ? `, ${d.customer.phone}` : ""}`);
  }
  if (d.order.orderType === "DELIVERY" && d.order.deliveryAddress) {
    text(`Address: ${d.order.deliveryAddress}`);
  }
  rule();

  itemRow("Product", "Qty", "Price", "Total", true);
  rule();
  for (const item of d.items) {
    itemRow(item.name, String(item.quantity), money(item.unitPrice), money(item.amount));
  }
  rule();

  pair("Subtotal", rs(d.subtotal));
  pair("Discount", Number(d.discount) > 0 ? `-${rs(d.discount)}` : rs(d.discount));
  pair("GST", rs(d.tax));
  if (Number(d.deliveryCharge) > 0) pair("Delivery", rs(d.deliveryCharge));
  rule();
  pair("GRAND TOTAL", rs(d.grandTotal), { bold: true, size: 10 });
  rule();

  if (d.payment) {
    const isCash = d.payment.method === "CASH" && d.payment.amountReceived !== null;
    pair("Payment Method", METHOD_LABEL[d.payment.method]);
    pair("Amount Paid", rs(isCash ? (d.payment.amountReceived as string) : d.payment.amount));
    pair("Change", rs(d.payment.changeGiven));
    rule();
  }

  text(d.settings.footer, { align: "center", bold: true, gap: 0 });
  return y;
}

export function renderReceiptPdf(data: InvoiceData): Promise<Buffer> {
  // First pass on a very tall page, only to measure how tall the receipt is
  const probe = new PDFDocument({ size: [PAGE_WIDTH, 5000], margin: 0 });
  probe.on("data", () => undefined);
  const height = Math.ceil(draw(probe, data)) + 18;
  probe.end();

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_WIDTH, height], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    draw(doc, data);
    doc.end();
  });
}
