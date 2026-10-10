import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "../../types/dashboard";
import { formatAxisMoney, formatMoney } from "../../utils/format";

type Metric = "sales" | "orders" | "profit";

const LABEL: Record<Metric, string> = { sales: "Sales", orders: "Orders", profit: "Profit" };

interface Props {
  series: SeriesPoint[];
  canViewProfit: boolean;
}

export default function SalesChart({ series, canViewProfit }: Props) {
  const [metric, setMetric] = useState<Metric>("sales");
  const metrics: Metric[] = canViewProfit ? ["sales", "orders", "profit"] : ["sales", "orders"];

  const data = series.map((point) => ({
    label: point.label,
    value:
      metric === "sales" ? Number(point.sales) : metric === "orders" ? point.orders : Number(point.profit ?? 0),
  }));
  const hasData = data.some((point) => point.value > 0);
  const isMoney = metric !== "orders";

  return (
    <div>
      <div className="mb-4 inline-flex rounded-lg bg-gray-100 p-1" role="tablist" aria-label="Chart metric">
        {metrics.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={metric === m}
            onClick={() => setMetric(m)}
            className={[
              "h-8 rounded-md px-4 text-sm font-medium transition-colors",
              metric === m ? "bg-white text-leo-700 shadow-sm" : "text-gray-600 hover:text-gray-900",
            ].join(" ")}
          >
            {LABEL[m]}
          </button>
        ))}
      </div>

      {hasData ? (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} fontSize={12} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                fontSize={12}
                allowDecimals={false}
                tickFormatter={(v: number) => (isMoney ? formatAxisMoney(v) : String(v))}
              />
              <Tooltip
                cursor={{ fill: "#f0fdf4" }}
                formatter={(value) =>
                  [isMoney ? formatMoney(Number(value)) : String(value), LABEL[metric]] as [string, string]
                }
              />
              <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
          No {LABEL[metric].toLowerCase()} in this period yet.
        </div>
      )}
    </div>
  );
}
