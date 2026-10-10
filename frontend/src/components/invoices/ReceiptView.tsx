import type { Invoice, PaymentMethod } from "../../types/payments";
import type { OrderType } from "../../types/orders";
import { formatPlain, formatRupeesText } from "../../utils/money";

const TZ = "Asia/Kolkata";

const TYPE_LABEL: Record<OrderType, string> = { DINE_IN: "Dine In", TAKE_AWAY: "Take Away", DELIVERY: "Delivery" };
const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: "Cash", UPI: "UPI", CARD: "Card", OTHER: "Other" };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });

function Rule() {
  return <div className="my-2 border-t border-dashed border-black" />;
}

function Row({ left, right, bold = false }: { left: string; right: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}>
      <span>{left}</span>
      <span className="shrink-0 text-right">{right}</span>
    </div>
  );
}

const GRID = { display: "grid", gridTemplateColumns: "1fr 1.8rem 3.8rem 4.2rem", columnGap: "4px" } as const;

interface Props {
  invoice: Invoice;
  bare?: boolean; // no border, used for the printed copy
}

// A receipt sized for an 80 mm thermal printer
export default function ReceiptView({ invoice, bare = false }: Props) {
  const { shop, settings, order, payment } = invoice;
  const isCash = payment?.method === "CASH" && payment.amountReceived !== null;

  return (
    <div
      className={`bg-white text-black ${bare ? "" : "rounded-xl border border-gray-300 shadow-sm"}`}
      style={{
        width: "72mm",
        maxWidth: "100%",
        padding: "4mm 3mm",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: "11px",
        lineHeight: 1.35,
      }}
    >
      <div className="text-center">
        <p className="text-base font-bold uppercase">{shop.name}</p>
        {shop.address && <p>{shop.address}</p>}
        {shop.phone && <p>Phone: {shop.phone}</p>}
        {settings.showGst && shop.gstNumber && <p>GSTIN: {shop.gstNumber}</p>}
      </div>
      <Rule />

      {invoice.voided && (
        <p className="mb-2 border border-black py-1 text-center font-bold">CANCELLED / REFUNDED</p>
      )}

      <Row left="Invoice No:" right={invoice.invoiceNo} bold />
      <Row left="Date:" right={fmtDate(invoice.issuedAt)} />
      <Row left="Time:" right={fmtTime(invoice.issuedAt)} />
      {settings.showCashier && <Row left="Cashier:" right={invoice.cashier} />}
      <Row left="Order:" right={`#${String(order.orderNo).padStart(6, "0")}`} />
      <Row left="Type:" right={`${TYPE_LABEL[order.orderType]}${order.tableNo ? `, table ${order.tableNo}` : ""}`} />
      {invoice.customer && (
        <p>
          Customer: {invoice.customer.name}
          {invoice.customer.phone ? `, ${invoice.customer.phone}` : ""}
        </p>
      )}
      {order.orderType === "DELIVERY" && order.deliveryAddress && <p>Address: {order.deliveryAddress}</p>}
      <Rule />

      <div style={GRID} className="font-bold">
        <span>Product</span>
        <span className="text-center">Qty</span>
        <span className="text-right">Price</span>
        <span className="text-right">Total</span>
      </div>
      <Rule />
      <div className="space-y-1">
        {invoice.items.map((item, index) => (
          <div key={index} style={GRID}>
            <span className="break-words">{item.name}</span>
            <span className="text-center">{item.quantity}</span>
            <span className="text-right">{formatPlain(item.unitPrice)}</span>
            <span className="text-right">{formatPlain(item.amount)}</span>
          </div>
        ))}
      </div>
      <Rule />

      <Row left="Subtotal" right={formatRupeesText(invoice.subtotal)} />
      <Row
        left="Discount"
        right={Number(invoice.discount) > 0 ? `-${formatRupeesText(invoice.discount)}` : formatRupeesText(invoice.discount)}
      />
      <Row left="GST" right={formatRupeesText(invoice.tax)} />
      {Number(invoice.deliveryCharge) > 0 && <Row left="Delivery" right={formatRupeesText(invoice.deliveryCharge)} />}
      <Rule />
      <div className="text-sm">
        <Row left="GRAND TOTAL" right={formatRupeesText(invoice.grandTotal)} bold />
      </div>
      <Rule />

      {payment && (
        <>
          <Row left="Payment Method" right={METHOD_LABEL[payment.method]} />
          <Row left="Amount Paid" right={formatRupeesText(isCash ? (payment.amountReceived as string) : payment.amount)} />
          <Row left="Change" right={formatRupeesText(payment.changeGiven)} />
          <Rule />
        </>
      )}

      <p className="text-center font-bold">{settings.footer}</p>
    </div>
  );
}
