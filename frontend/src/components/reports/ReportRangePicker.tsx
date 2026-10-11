import { RANGE_PRESETS, type RangePreset } from "../../utils/reportRange";
import { toYmd } from "../../utils/format";

interface Props {
  preset: RangePreset;
  onPreset: (preset: RangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFrom: (value: string) => void;
  onCustomTo: (value: string) => void;
  error: string | null;
}

export default function ReportRangePicker({ preset, onPreset, customFrom, customTo, onCustomFrom, onCustomTo, error }: Props) {
  const maxDate = toYmd(new Date());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Date range">
        {RANGE_PRESETS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={preset === item.key}
            onClick={() => onPreset(item.key)}
            className={[
              "h-10 rounded-full px-4 text-sm font-medium transition-colors",
              preset === item.key
                ? "bg-leo-600 text-white"
                : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-leo-50 p-3">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">From</span>
            <input
              type="date"
              value={customFrom}
              max={maxDate}
              onChange={(e) => onCustomFrom(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3"
            />
          </label>
          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">To</span>
            <input
              type="date"
              value={customTo}
              max={maxDate}
              onChange={(e) => onCustomTo(e.target.value)}
              className="h-10 rounded-lg border border-gray-300 bg-white px-3"
            />
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
