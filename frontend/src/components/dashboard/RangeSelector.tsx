import { useState } from "react";
import type { RangeKey } from "../../types/dashboard";
import { toYmd } from "../../utils/format";

const TABS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

interface Props {
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  custom: { from: string; to: string };
  onApplyCustom: (from: string, to: string) => void;
}

export default function RangeSelector({ range, onRangeChange, custom, onApplyCustom }: Props) {
  const [from, setFrom] = useState(custom.from);
  const [to, setTo] = useState(custom.to);
  const [error, setError] = useState<string | null>(null);
  const maxDate = toYmd(new Date());

  function apply() {
    if (!from || !to) {
      setError("Choose both a start and an end date.");
      return;
    }
    if (from > to) {
      setError("The start date must not be after the end date.");
      return;
    }
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > 366) {
      setError("Please choose a range of one year or less.");
      return;
    }
    setError(null);
    onApplyCustom(from, to);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Date range">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={range === tab.key}
            onClick={() => onRangeChange(tab.key)}
            className={[
              "h-10 rounded-full px-4 text-sm font-medium transition-colors",
              range === tab.key
                ? "bg-leo-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
            ].join(" ")}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {range === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-leo-50 p-3">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">From</span>
            <input
              type="date"
              value={from}
              max={maxDate}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3"
            />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">To</span>
            <input
              type="date"
              value={to}
              max={maxDate}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3"
            />
          </label>
          <button
            type="button"
            onClick={apply}
            className="h-10 rounded-lg bg-leo-600 px-5 text-sm font-semibold text-white hover:bg-leo-700"
          >
            Apply
          </button>
          {error && (
            <p role="alert" className="w-full text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
