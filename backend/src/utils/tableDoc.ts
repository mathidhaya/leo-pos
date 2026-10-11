// One simple description of a report table. Both the CSV file and the PDF file are made from it.

export type CellType = "text" | "money" | "int" | "percent";
export type CellValue = string | number | null;

export interface TableColumn {
  key: string;
  label: string;
  type: CellType;
  weight?: number; // how wide the column is in the PDF, compared with the others
}

export interface SummaryItem {
  label: string;
  value: CellValue;
  type: CellType;
}

export interface TableDoc {
  title: string;
  shop: string;
  from: string;
  to: string;
  notes: string[];
  summary: SummaryItem[];
  columns: TableColumn[];
  rows: Array<Record<string, CellValue>>;
  totals: Record<string, CellValue> | null;
  generatedAt: string; // ISO time
}

export function formatGenerated(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// A spreadsheet runs text that starts with = + - @ as a formula. Product names are typed by people,
// so a leading apostrophe makes such text harmless. Numbers from our own calculations are never touched.
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: CellValue, type: CellType): string {
  if (value === null || value === "") return "";
  let text = String(value);
  if (type === "text") text = safeText(text);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const BOM = "\uFEFF"; // makes Excel read the file as UTF-8

export function renderCsv(doc: TableDoc): string {
  const lines: string[] = [];
  const meta = (label: string, value: string) => lines.push(`${csvCell(label, "text")},${csvCell(value, "text")}`);

  meta("Report", doc.title);
  meta("Cafe", doc.shop);
  meta("Period", `${doc.from} to ${doc.to}`);
  meta("Generated", formatGenerated(doc.generatedAt));
  for (const note of doc.notes) meta("Note", note);
  lines.push("");

  lines.push(doc.columns.map((column) => csvCell(column.label, "text")).join(","));
  for (const row of doc.rows) {
    lines.push(doc.columns.map((column) => csvCell(row[column.key] ?? null, column.type)).join(","));
  }
  if (doc.totals) {
    const totals = doc.totals;
    lines.push(doc.columns.map((column) => csvCell(totals[column.key] ?? null, column.type)).join(","));
  }

  return BOM + lines.join("\r\n") + "\r\n";
}
