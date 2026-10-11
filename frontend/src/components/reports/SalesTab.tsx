import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { BadgePercent, IndianRupee, Receipt, ShoppingBag, Tag, TrendingUp } from "lucide-react";
import { fetchSales } from "../../api/reports";
import type { SalesPoint, TabProps } from "../../types/reports";
import { formatMoney } from "../../utils/format";
import StatCard from "../dashboard/StatCard";
import ReportTable, { type ReportColumn } from "./ReportTable";
import { ReportError, ReportSkeleton } from "./ReportStatus";
import TrendChart from "./TrendChart";

type Metric = "total" | "orders" | "profit";

const METRICS: Array<{ key: Metric; label: string; color: string }> = [
  { key: "total", label: "Sales", color: "#16a34a" },
  { key: "orders", label: "Orders", color: "#2563eb" },
  { key: "profit", label: "Profit", color: "#15803d" },
];

const GROUP_LABEL = { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" } as const;

export default function SalesTab({ from, to, groupBy }: TabProps) {
  const [metric, setMetric] = useState<Metric>("total");

  const query = useQuery({
    queryKey: ["reports", "sales", from, to, groupBy],
    queryFn: () => fetchSales({ from, to, groupBy }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <ReportSkeleton />;
  if (!query.data) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;

  const { summary, series } = query.data;
  const active = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const chartData = series.map((point) => ({
    short: point.short,
    total: Number(point.total),
    orders: point.orders,
    profit: Number(point.profit),
  }));

  const columns: ReportColumn<SalesPoint>[] = [
    { key: "period", label: "Period", render: (r) => r.label, footer: "Total" },
    { key: "orders", label: "Orders", align: "right", render: (r) => r.orders, footer: summary.orders },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => formatMoney(r.revenue), footer: formatMoney(summary.revenue) },
    { key: "discount", label: "Discount", align: "right", render: (r) => formatMoney(r.discount), footer: formatMoney(summary.discount) },
    { key: "tax", label: "GST", align: "right", render: (r) => formatMoney(r.tax), footer: formatMoney(summary.tax) },
    { key: "delivery", label: "Delivery", align: "right", render: (r) => formatMoney(r.delivery), footer: formatMoney(summary.delivery) },
    {
      key: "total",
      label: "Total sales",
      align: "right",
      render: (r) => <span className="font-semibold text-gray-900">{formatMoney(r.total)}</span>,
      footer: formatMoney(summary.total),
    },
    { key: "profit", label: "Profit", align: "right", render: (r) => formatMoney(r.profit), footer: formatMoney(summary.profit) },
  ];

  const left = summary.unpaidOrders + summary.cancelledOrders;

  return (
    <div className={`space-y-6 ${query.isPlaceholderData ? "opacity-60" : ""}`}>
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Total sales" value={formatMoney(summary.total)} icon={IndianRupee} tone="green" hint="GST and delivery included" />
        <StatCard label="Orders" value={String(summary.orders)} icon={ShoppingBag} tone="blue" hint="Paid orders" />
        <StatCard label="Profit" value={formatMoney(summary.profit)} icon={TrendingUp} tone="green" hint="After cost and discounts" />
        <StatCard label="GST collected" value={formatMoney(summary.tax)} icon={Receipt} tone="gray" />
        <StatCard label="Discounts given" value={formatMoney(summary.discount)} icon={Tag} tone="amber" />
        <StatCard label="Average order" value={formatMoney(summary.averageOrder)} icon={BadgePercent} tone="blue" />
      </section>

      {left > 0 && (
        <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Not included: {summary.unpaidOrders} unpaid order{summary.unpaidOrders === 1 ? "" : "s"} and {summary.cancelledOrders}{" "}
          cancelled or refunded order{summary.cancelledOrders === 1 ? "" : "s"} in this period.
        </p>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6" aria-label="Chart">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">{GROUP_LABEL[groupBy]} sales</h2>
          <div className="inline-flex rounded-lg bg-gray-100 p-1" role="tablist" aria-label="Chart metric">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={metric === m.key}
                onClick={() => setMetric(m.key)}
                className={[
                  "h-8 rounded-md px-4 text-sm font-medium transition-colors",
                  metric === m.key ? "bg-white text-leo-700 shadow-sm" : "text-gray-600 hover:text-gray-900",
                ].join(" ")}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <TrendChart
          data={chartData}
          series={[{ dataKey: active.key, name: active.label, color: active.color }]}
          kind={metric === "orders" ? "count" : "money"}
          emptyText="No sales in this period."
        />
      </section>

      <ReportTable columns={columns} rows={series} rowKey={(r) => r.bucket} />
    </div>
  );
}
