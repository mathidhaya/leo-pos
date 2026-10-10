import { toYmd } from "./format";

export type Preset = "today" | "yesterday" | "week" | "month" | "all" | "custom";

export const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Last 7 days" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

export function computeRange(
  preset: Preset,
  customFrom: string,
  customTo: string
): { from?: string; to?: string; error?: string } {
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return toYmd(d);
  };

  switch (preset) {
    case "today":
      return { from: toYmd(now), to: toYmd(now) };
    case "yesterday":
      return { from: daysAgo(1), to: daysAgo(1) };
    case "week":
      return { from: daysAgo(6), to: toYmd(now) };
    case "month":
      return { from: toYmd(new Date(now.getFullYear(), now.getMonth(), 1)), to: toYmd(now) };
    case "all":
      return {};
    case "custom":
      if (!customFrom || !customTo) return { error: "Choose both a start and an end date." };
      if (customFrom > customTo) return { error: "The start date must not be after the end date." };
      return { from: customFrom, to: customTo };
  }
}
