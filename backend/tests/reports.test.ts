import { describe, expect, it } from "vitest";
import { resolveRange } from "../src/utils/dateRange";
import { buildReportBuckets, type GroupBy } from "../src/utils/reportBuckets";
import { renderCsv, type TableDoc } from "../src/utils/tableDoc";
import { renderTablePdf } from "../src/utils/tablePdf";
import { exportQuerySchema, rangeQuerySchema, trendQuerySchema } from "../src/validators/report.validators";

function buckets(from: string, to: string, groupBy: GroupBy) {
  const range = resolveRange({ range: "custom", from, to });
  return buildReportBuckets(range.start.getTime(), range.end.getTime(), groupBy);
}

describe("buildReportBuckets", () => {
  it("makes one bucket per day, with no gaps", () => {
    const result = buckets("2026-10-01", "2026-10-03", "day");
    expect(result.map((b) => b.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(result[0].label).toBe("1 Oct 2026");
    expect(result[0].short).toBe("1 Oct");
  });

  it("makes a single bucket for a single day", () => {
    expect(buckets("2026-10-11", "2026-10-11", "day")).toHaveLength(1);
  });

  it("counts a whole year of days (2028 is a leap year)", () => {
    expect(buckets("2028-01-01", "2028-12-31", "day")).toHaveLength(366);
  });

  it("starts weeks on Monday, even when the range starts mid-week", () => {
    // 7 October 2026 is a Wednesday
    const result = buckets("2026-10-07", "2026-10-20", "week");
    expect(result.map((b) => b.key)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(result[0].label).toBe("Week of 5 Oct 2026");
  });

  it("makes month buckets across a year boundary", () => {
    const result = buckets("2026-11-15", "2027-02-10", "month");
    expect(result.map((b) => b.key)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(result[1].label).toBe("Dec 2026");
    expect(result[2].short).toBe("Jan 27");
  });

  it("makes year buckets", () => {
    const result = buckets("2025-06-01", "2027-02-01", "year");
    expect(result.map((b) => b.key)).toEqual(["2025", "2026", "2027"]);
  });
});

describe("report query validation", () => {
  const ok = { from: "2026-10-01", to: "2026-10-11" };

  it("accepts a normal range and defaults to grouping by day", () => {
    const parsed = trendQuerySchema.parse(ok);
    expect(parsed.groupBy).toBe("day");
  });

  it("rejects bad dates and reversed ranges", () => {
    expect(trendQuerySchema.safeParse({ from: "2026-13-01", to: "2026-10-01" }).success).toBe(false);
    expect(trendQuerySchema.safeParse({ from: "yesterday", to: "2026-10-01" }).success).toBe(false);
    expect(trendQuerySchema.safeParse({ from: "2026-10-11", to: "2026-10-01" }).success).toBe(false);
    expect(trendQuerySchema.safeParse({ from: "2026-10-01" }).success).toBe(false);
  });

  it("limits grouping by day to one year", () => {
    expect(trendQuerySchema.safeParse({ from: "2026-01-01", to: "2027-06-30" }).success).toBe(false);
    expect(trendQuerySchema.safeParse({ from: "2026-01-01", to: "2027-06-30", groupBy: "week" }).success).toBe(true);
  });

  it("limits every range to 5 years", () => {
    expect(trendQuerySchema.safeParse({ from: "2018-01-01", to: "2026-10-01", groupBy: "month" }).success).toBe(false);
    expect(rangeQuerySchema.safeParse({ from: "2018-01-01", to: "2026-10-01" }).success).toBe(false);
    expect(rangeQuerySchema.safeParse({ from: "2022-01-01", to: "2026-10-01" }).success).toBe(true);
  });

  it("does not group by day for the reports that have no periods", () => {
    const parsed = exportQuerySchema.safeParse({ from: "2022-01-01", to: "2026-10-01", report: "products", format: "csv" });
    expect(parsed.success).toBe(true);
    expect(
      exportQuerySchema.safeParse({ from: "2022-01-01", to: "2026-10-01", report: "sales", format: "csv" }).success
    ).toBe(false);
  });

  it("only allows known reports and formats", () => {
    expect(exportQuerySchema.safeParse({ ...ok, report: "secrets", format: "csv" }).success).toBe(false);
    expect(exportQuerySchema.safeParse({ ...ok, report: "sales", format: "xlsx" }).success).toBe(false);
  });
});

const sample: TableDoc = {
  title: "Product sales report",
  shop: "Leo Cafe",
  from: "2026-10-01",
  to: "2026-10-11",
  notes: ["Counts paid orders only."],
  summary: [{ label: "Revenue", value: "1234.50", type: "money" }],
  columns: [
    { key: "name", label: "Product", type: "text" },
    { key: "quantity", label: "Qty", type: "int" },
    { key: "profit", label: "Profit", type: "money" },
  ],
  rows: [
    { name: 'Mocha, "large"', quantity: 3, profit: "-12.50" },
    { name: '=HYPERLINK("http://example.com")', quantity: 1, profit: "5.00" },
    { name: "Line\nbreak", quantity: 1, profit: "1.00" },
  ],
  totals: { name: "Total", quantity: 5, profit: "-6.50" },
  generatedAt: "2026-10-11T08:30:00.000Z",
};

describe("renderCsv", () => {
  const csv = renderCsv(sample);

  it("starts with the marker that makes Excel read it as UTF-8", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("describes the report at the top", () => {
    expect(csv).toContain("Report,Product sales report");
    expect(csv).toContain("Period,2026-10-01 to 2026-10-11");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(csv).toContain('"Mocha, ""large"""');
    expect(csv).toContain('"Line\nbreak"');
  });

  it("stops spreadsheet formulas from running", () => {
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/(^|,)"?=HYPERLINK/m);
  });

  it("keeps negative numbers as plain numbers", () => {
    expect(csv).toContain(",-12.50");
    expect(csv).not.toContain("'-12.50");
  });

  it("ends with a totals row", () => {
    expect(csv.trim().split("\r\n").pop()).toBe("Total,5,-6.50");
  });
});

describe("renderTablePdf", () => {
  it("creates a real PDF", async () => {
    const pdf = await renderTablePdf(sample);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("handles a long table, many columns and characters outside Latin letters", async () => {
    const columns = Array.from({ length: 8 }, (_, i) => ({
      key: `c${i}`,
      label: `Column ${i}`,
      type: i === 0 ? ("text" as const) : ("money" as const),
    }));
    const rows = Array.from({ length: 250 }, (_, n) => {
      const row: Record<string, string | number | null> = { c0: n === 3 ? "தமிழ் Product ₹" : `Product ${n}` };
      for (let i = 1; i < 8; i++) row[`c${i}`] = (n * i * 13.37).toFixed(2);
      return row;
    });
    const pdf = await renderTablePdf({ ...sample, columns, rows, totals: null, summary: [] });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("handles a report with no rows", async () => {
    const pdf = await renderTablePdf({ ...sample, rows: [], totals: null });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
