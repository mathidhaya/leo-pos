// A small bar with a percentage, for "share of sales" columns
export default function ShareBar({ percent }: { percent: number | null }) {
  const value = percent ?? 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
        <div className="h-2 rounded-full bg-leo-600" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
      <span className="w-12 text-right text-xs text-gray-600">{percent === null ? "-" : `${percent.toFixed(1)}%`}</span>
    </div>
  );
}
