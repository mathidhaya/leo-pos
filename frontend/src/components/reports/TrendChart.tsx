import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxisMoney, formatMoney } from "../../utils/format";

export interface TrendSeries {
  dataKey: string;
  name: string;
  color: string;
}

interface Props {
  data: Array<Record<string, number | string>>; // every row has a "short" label for the x axis
  series: TrendSeries[];
  kind: "money" | "count";
  emptyText: string;
}

export default function TrendChart({ data, series, kind, emptyText }: Props) {
  const hasData = data.some((point) => series.some((s) => Number(point[s.dataKey]) !== 0));

  if (!hasData) {
    return (
      <div className="flex h-72 items-center justify-center rounded-xl border border-dashed border-gray-300 text-sm text-gray-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="short" tickLine={false} axisLine={false} minTickGap={16} fontSize={12} />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            fontSize={12}
            allowDecimals={false}
            tickFormatter={(v: number) => (kind === "money" ? formatAxisMoney(v) : String(v))}
          />
          <Tooltip
            cursor={{ fill: "#f0fdf4" }}
            formatter={(value, name) =>
              [kind === "money" ? formatMoney(Number(value)) : String(value), String(name)] as [string, string]
            }
          />
          {series.length > 1 && <Legend />}
          {series.map((s) => (
            <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={32} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
