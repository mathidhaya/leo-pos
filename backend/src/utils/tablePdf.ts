import PDFDocument from "pdfkit";
import { formatGenerated, type CellType, type CellValue, type SummaryItem, type TableDoc } from "./tableDoc";

type Doc = InstanceType<typeof PDFDocument>;

// The standard PDF fonts only know Latin letters, and have no rupee sign (amounts say "Rs.").
// Anything else is replaced, so the file always opens.
const latin = (text: string) => text.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const twoDecimals = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en-IN");

function cell(value: CellValue, type: CellType): string {
  if (value === null || value === "") return "-";
  switch (type) {
    case "money":
      return twoDecimals.format(Number(value));
    case "int":
      return whole.format(Number(value));
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    default:
      return latin(String(value));
  }
}

function summaryText(item: SummaryItem): string {
  if (item.value === null || item.value === "") return "-";
  return item.type === "money" ? `Rs. ${cell(item.value, "money")}` : cell(item.value, item.type);
}

const PAD = 4;
const FONT_SIZE = 8;

function draw(doc: Doc, table: TableDoc): void {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const top = doc.page.margins.top;
  const limit = doc.page.height - doc.page.margins.bottom - 16; // room for the page number

  const font = (bold: boolean, size: number) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(size);

  let y = top;
  const write = (text: string, o: { size?: number; bold?: boolean; color?: string; gap?: number } = {}) => {
    font(o.bold ?? false, o.size ?? 9).fillColor(o.color ?? "#111827");
    doc.text(text, left, y, { width });
    y += doc.heightOfString(text, { width }) + (o.gap ?? 3);
  };

  // ----- heading -----
  write(latin(table.title), { size: 17, bold: true, color: "#15803d", gap: 4 });
  write(`${latin(table.shop)}   |   ${table.from} to ${table.to}`, { size: 10 });
  write("All amounts are in Rs. (Indian rupees).", { color: "#6b7280", gap: 1 });
  for (const note of table.notes) write(latin(note), { color: "#6b7280", gap: 1 });
  y += 8;

  // ----- key figures -----
  if (table.summary.length > 0) {
    const perRow = 3;
    const cellWidth = width / perRow;
    table.summary.forEach((item, index) => {
      const col = index % perRow;
      if (col === 0 && index > 0) y += 34;
      const x = left + col * cellWidth;
      font(false, 8).fillColor("#6b7280").text(latin(item.label), x, y, { width: cellWidth - 8 });
      font(true, 12).fillColor("#111827").text(summaryText(item), x, y + 11, { width: cellWidth - 8 });
    });
    y += 42;
  }

  // ----- table -----
  const weights = table.columns.map((column) => column.weight ?? (column.type === "text" ? 3 : 1.5));
  const weightSum = weights.reduce((total, w) => total + w, 0);
  const widths = weights.map((w) => (w / weightSum) * width);

  const measure = (values: string[], bold: boolean): number => {
    font(bold, FONT_SIZE);
    let tallest = 0;
    values.forEach((value, i) => {
      tallest = Math.max(tallest, doc.heightOfString(value, { width: widths[i] - PAD * 2 }));
    });
    return tallest + PAD * 2;
  };

  const drawRow = (at: number, values: string[], bold: boolean, fill: string | null): number => {
    const height = measure(values, bold);
    if (fill) doc.save().rect(left, at, width, height).fill(fill).restore();
    font(bold, FONT_SIZE).fillColor("#111827");
    let x = left;
    values.forEach((value, i) => {
      doc.text(value, x + PAD, at + PAD, {
        width: widths[i] - PAD * 2,
        align: table.columns[i].type === "text" ? "left" : "right",
      });
      x += widths[i];
    });
    return at + height;
  };

  const header = (at: number) =>
    drawRow(
      at,
      table.columns.map((column) => latin(column.label)),
      true,
      "#dcfce7"
    );

  if (table.rows.length === 0) {
    write("No data for this period.", { color: "#6b7280" });
  } else {
    y = header(y);

    table.rows.forEach((row, index) => {
      const values = table.columns.map((column) => cell(row[column.key] ?? null, column.type));
      if (y + measure(values, false) > limit) {
        doc.addPage();
        y = header(top);
      }
      y = drawRow(y, values, false, index % 2 === 1 ? "#f9fafb" : null);
    });

    if (table.totals) {
      const totals = table.totals;
      const values = table.columns.map((column) => cell(totals[column.key] ?? null, column.type));
      if (y + measure(values, true) > limit) {
        doc.addPage();
        y = header(top);
      }
      y = drawRow(y, values, true, "#ecfdf5");
    }
  }

  // ----- page numbers (added at the end, when the number of pages is known) -----
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(pages.start + i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // otherwise writing this low would start a new page
    font(false, 8)
      .fillColor("#6b7280")
      .text(`Page ${i + 1} of ${pages.count}   |   Generated ${formatGenerated(table.generatedAt)}`, left, doc.page.height - 28, {
        width,
        align: "center",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
}

export function renderTablePdf(table: TableDoc): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // Wide tables (more than 6 columns) are printed sideways
    const doc = new PDFDocument({
      size: "A4",
      layout: table.columns.length > 6 ? "landscape" : "portrait",
      margin: 36,
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    try {
      draw(doc, table);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
