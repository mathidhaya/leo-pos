// All "today / this week / this month" logic is done in India time (IST = UTC+5:30, no daylight saving).
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const OFFSET_MS = 330 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MAX_RANGE_DAYS = 366;

export type RangeKey = "today" | "week" | "month" | "custom";
export type Granularity = "hour" | "day";

export interface RangeInput {
  range: RangeKey;
  from?: string;
  to?: string;
}

export interface ResolvedRange {
  key: RangeKey;
  start: Date; // inclusive
  end: Date; // exclusive
  granularity: Granularity;
  from: string; // YYYY-MM-DD in IST
  to: string; // YYYY-MM-DD in IST
}

export interface Bucket {
  key: string;
  label: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

// Shifts a time so that the getUTC* methods return the IST wall-clock values.
const wall = (ms: number) => new Date(ms + OFFSET_MS);

function ymd(ms: number): string {
  const d = wall(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function startOfDay(ms: number): number {
  const d = wall(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - OFFSET_MS;
}

export function isValidYmd(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function parseYmd(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, m - 1, d) - OFFSET_MS;
}

export function resolveRange(input: RangeInput, nowMs: number = Date.now()): ResolvedRange {
  const todayStart = startOfDay(nowMs);
  const tomorrowStart = todayStart + DAY_MS;
  let start: number;
  let end: number;

  if (input.range === "today") {
    start = todayStart;
    end = tomorrowStart;
  } else if (input.range === "week") {
    // Weeks start on Monday and run up to the end of today
    const daysSinceMonday = (wall(nowMs).getUTCDay() + 6) % 7;
    start = todayStart - daysSinceMonday * DAY_MS;
    end = tomorrowStart;
  } else if (input.range === "month") {
    const d = wall(nowMs);
    start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - OFFSET_MS;
    end = tomorrowStart;
  } else {
    start = parseYmd(input.from as string);
    end = parseYmd(input.to as string) + DAY_MS;
  }

  const days = Math.round((end - start) / DAY_MS);
  return {
    key: input.range,
    start: new Date(start),
    end: new Date(end),
    granularity: days === 1 ? "hour" : "day",
    from: ymd(start),
    to: ymd(end - 1),
  };
}

// Every bucket of the chart (an hour or a day), including empty ones.
export function buildBuckets(range: ResolvedRange): Bucket[] {
  const buckets: Bucket[] = [];
  const step = range.granularity === "hour" ? HOUR_MS : DAY_MS;

  for (let ms = range.start.getTime(); ms < range.end.getTime(); ms += step) {
    const d = wall(ms);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

    if (range.granularity === "hour") {
      const hour = d.getUTCHours();
      buckets.push({
        key: `${date}T${pad(hour)}`,
        label: `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`,
      });
    } else {
      buckets.push({ key: date, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` });
    }
  }
  return buckets;
}
