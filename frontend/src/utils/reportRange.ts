import { toYmd } from "./format";

export type RangePreset = "today" | "yesterday" | "last7" | "last30" | "month" | "lastMonth" | "year" | "custom";

export const RANGE_PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 days" },
  { key: "last30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

// The same limits as the server
export const MAX_REPORT_DAYS = 1830; // 5 years
export const MAX_DAILY_DAYS = 366; // grouping by day needs a range of one year or less

export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

export interface ReportRange {
  from: string;
  to: string;
  error: string | null;
}

export function computeReportRange(preset: RangePreset, customFrom: string, customTo: string): ReportRange {
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return toYmd(d);
  };
  const ok = (from: string, to: string): ReportRange => ({ from, to, error: null });

  switch (preset) {
    case "today":
      return ok(toYmd(now), toYmd(now));
    case "yesterday":
      return ok(daysAgo(1), daysAgo(1));
    case "last7":
      return ok(daysAgo(6), toYmd(now));
    case "last30":
      return ok(daysAgo(29), toYmd(now));
    case "month":
      return ok(toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), toYmd(now));
    case "lastMonth":
      return ok(
        toYmd(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        toYmd(new Date(now.getFullYear(), now.getMonth(), 0))
      );
    case "year":
      return ok(toYmd(new Date(now.getFullYear(), 0, 1)), toYmd(now));
    case "custom": {
      if (!customFrom || !customTo) return { from: "", to: "", error: "Choose both a start and an end date." };
      if (customFrom > customTo) return { from: "", to: "", error: "The start date must not be after the end date." };
      if (rangeDays(customFrom, customTo) > MAX_REPORT_DAYS) {
        return { from: "", to: "", error: "Please choose a range of 5 years or less." };
      }
      return ok(customFrom, customTo);
    }
  }
}
