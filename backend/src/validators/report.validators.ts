import { z } from "zod";
import { isValidYmd } from "../utils/dateRange";

export const MAX_REPORT_DAYS = 1830; // 5 years
export const MAX_DAILY_DAYS = 366; // grouping by day needs a range of one year or less

const dateField = z.string().refine(isValidYmd, "Use the date format YYYY-MM-DD.");
const groupByField = z.enum(["day", "week", "month", "year"]);

function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

// Returns false (after reporting the problem) when the range itself is not acceptable
function checkRange(query: { from: string; to: string }, ctx: z.RefinementCtx): boolean {
  if (query.from > query.to) {
    ctx.addIssue({ code: "custom", path: ["from"], message: "The start date must not be after the end date." });
    return false;
  }
  if (rangeDays(query.from, query.to) > MAX_REPORT_DAYS) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "Please choose a range of 5 years or less." });
    return false;
  }
  return true;
}

function checkDaily(query: { from: string; to: string; groupBy: string }, ctx: z.RefinementCtx): void {
  if (query.groupBy === "day" && rangeDays(query.from, query.to) > MAX_DAILY_DAYS) {
    ctx.addIssue({
      code: "custom",
      path: ["groupBy"],
      message: "Group by week, month or year for ranges longer than a year.",
    });
  }
}

const rangeBase = z.object({ from: dateField, to: dateField });

// Products, categories and payments
export const rangeQuerySchema = rangeBase.superRefine((query, ctx) => {
  checkRange(query, ctx);
});

// Sales and profit
export const trendQuerySchema = rangeBase
  .extend({ groupBy: groupByField.default("day") })
  .superRefine((query, ctx) => {
    if (checkRange(query, ctx)) checkDaily(query, ctx);
  });

export const exportQuerySchema = rangeBase
  .extend({
    report: z.enum(["sales", "profit", "products", "categories", "payments"]),
    format: z.enum(["csv", "pdf"]),
    groupBy: groupByField.default("day"),
  })
  .superRefine((query, ctx) => {
    if (!checkRange(query, ctx)) return;
    // Only the sales and profit reports are grouped by period
    if (query.report === "sales" || query.report === "profit") checkDaily(query, ctx);
  });

export type RangeQuery = z.infer<typeof rangeQuerySchema>;
export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type ExportQuery = z.infer<typeof exportQuerySchema>;
