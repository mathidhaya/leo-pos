// Builds the list of periods (days, weeks, months or years) that a report covers,
// including periods with no sales, so charts and tables have no gaps.
// All dates are India time (UTC+5:30, no daylight saving). Weeks start on Monday.

export type GroupBy = "day" | "week" | "month" | "year";

export interface ReportBucket {
  key: string; // matches the key made by the database query
  label: string; // full name, for tables
  short: string; // short name, for chart axes
}

const OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
// Shifts a time so that the getUTC* methods return the India wall-clock values
const wall = (ms: number) => new Date(ms + OFFSET_MS);

function ymd(ms: number): string {
  const d = wall(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const monthStart = (year: number, month: number) => Date.UTC(year, month, 1) - OFFSET_MS;

// startMs is the first moment of the range, endMs the first moment AFTER it (both India midnight).
export function buildReportBuckets(startMs: number, endMs: number, groupBy: GroupBy): ReportBucket[] {
  const buckets: ReportBucket[] = [];

  if (groupBy === "day" || groupBy === "week") {
    const step = groupBy === "day" ? DAY_MS : 7 * DAY_MS;
    let first = startMs;
    // A week bucket starts on the Monday on or before the first day of the range
    if (groupBy === "week") first -= ((wall(startMs).getUTCDay() + 6) % 7) * DAY_MS;

    for (let ms = first; ms < endMs; ms += step) {
      const d = wall(ms);
      const short = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
      const full = `${short} ${d.getUTCFullYear()}`;
      buckets.push({ key: ymd(ms), label: groupBy === "week" ? `Week of ${full}` : full, short });
    }
    return buckets;
  }

  const start = wall(startMs);
  let year = start.getUTCFullYear();
  let month = groupBy === "month" ? start.getUTCMonth() : 0;

  for (;;) {
    if (monthStart(year, month) >= endMs) break;

    if (groupBy === "month") {
      buckets.push({
        key: `${year}-${pad(month + 1)}`,
        label: `${MONTHS[month]} ${year}`,
        short: `${MONTHS[month]} ${String(year).slice(2)}`,
      });
      month += 1;
      if (month === 12) {
        month = 0;
        year += 1;
      }
    } else {
      buckets.push({ key: String(year), label: String(year), short: String(year) });
      year += 1;
    }
  }
  return buckets;
}
