import { TriangleAlert } from "lucide-react";
import type { StockAlert } from "../../types/inventory";

interface Props {
  alerts: StockAlert[];
  total: number; // how many products need attention in all
  onAdd: (alert: StockAlert) => void;
}

const SHOWN = 5;

export default function LowStockAlerts({ alerts, total, onAdd }: Props) {
  if (alerts.length === 0) return null;

  const shown = alerts.slice(0, SHOWN);
  const more = Math.max(0, total - shown.length);

  return (
    <section
      aria-label="Stock alerts"
      className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
      role="status"
    >
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
        <TriangleAlert className="h-5 w-5" />
        {total === 1 ? "1 product needs restocking" : `${total} products need restocking`}
      </h2>
      <ul className="space-y-2">
        {shown.map((alert) => (
          <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
            <span>
              <strong>{alert.name}</strong> {alert.status === "out" ? "is out of stock." : "stock is low."}
              <span className="ml-1 text-amber-800/80">
                ({alert.quantity} left, minimum {alert.minStock})
              </span>
            </span>
            <button
              type="button"
              onClick={() => onAdd(alert)}
              className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Add stock
            </button>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-xs text-amber-800">and {more} more. Use the Low stock filter below to see them all.</p>}
    </section>
  );
}
