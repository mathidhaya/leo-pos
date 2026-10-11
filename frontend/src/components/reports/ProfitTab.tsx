import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Coins, IndianRupee, Percent, Receipt, Tag, TrendingUp } from "lucide-react";
import { fetchProfit } from "../../api/reports";
import type { ProfitPoint, TabProps } from "../../types/reports";
import { formatMoney } from "../../utils/format";
import StatCard from "../dashboard/StatCard";
import ReportTable, { type ReportColumn } from "./ReportTable";
import { ReportError, ReportSkeleton } from "./ReportStatus";
import TrendChart from "./TrendChart";

const percentText = (value: number | null) => (value === null ? "-" : `${value.toFixed(1)}%`);

export default function ProfitTab({ from, to, groupBy }: TabProps) {
  const query = useQuery({
    queryKey: ["reports", "profit", from, to, groupBy],
    queryFn: () => fetchProfit({ from, to, groupBy }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <ReportSkeleton />;
  if (!query.data) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;

  const { summary, series } = query.data;

  const chartData = series.map((point) => ({
    short: point.short,
    revenue: Number(point.revenue),
    cost: Number(point.cost),
    profit: Number(point.profit),
  }));

  const columns: ReportColumn<ProfitPoint>[] = [
    { key: "period", label: "Period", render: (r) => r.label, footer: "Total" },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => formatMoney(r.revenue), footer: formatMoney(summary.revenue) },
    { key: "discount", label: "Discount", align: "right", render: (r) => formatMoney(r.discount), footer: formatMoney(summary.discount) },
    { key: "cost", label: "Cost", align: "right", render: (r) => formatMoney(r.cost), footer: formatMoney(summary.cost) },
    {
      key: "profit",
      label: "Profit",
      align: "right",
      render: (r) => (
        <span className={`font-semibold ${Number(r.profit) < 0 ? "text-red-600" : "text-gray-900"}`}>{formatMoney(r.profit)}</span>
      ),
      footer: formatMoney(summary.profit),
    },
    { key: "margin", label: "Margin", align: "right", render: (r) => percentText(r.marginPercent), footer: percentText(summary.marginPercent) },
  ];

  return (
    <div className={`space-y-6 ${query.isPlaceholderData ? "opacity-60" : ""}`}>
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Revenue" value={formatMoney(summary.revenue)} icon={IndianRupee} tone="green" hint="Before discount and GST" />
        <StatCard label="Cost" value={formatMoney(summary.cost)} icon={Coins} tone="amber" hint="Cost price of what was sold" />
        <StatCard label="Discount" value={formatMoney(summary.discount)} icon={Tag} tone="gray" />
        <StatCard label="GST collected" value={formatMoney(summary.tax)} icon={Receipt} tone="blue" hint="Not profit" />
        <StatCard label="Profit" value={formatMoney(summary.profit)} icon={TrendingUp} tone={Number(summary.profit) < 0 ? "red" : "green"} hint="Revenue - Discount - Cost" />
        <StatCard label="Profit margin" value={percentText(summary.marginPercent)} icon={Percent} tone="green" hint="Profit / net sales" />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6" aria-label="Chart">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Revenue, cost and profit</h2>
        <TrendChart
          data={chartData}
          series={[
            { dataKey: "revenue", name: "Revenue", color: "#16a34a" },
            { dataKey: "cost", name: "Cost", color: "#d97706" },
            { dataKey: "profit", name: "Profit", color: "#2563eb" },
          ]}
          kind="money"
          emptyText="No sales in this period."
        />
      </section>

      <ReportTable columns={columns} rows={series} rowKey={(r) => r.bucket} />
    </div>
  );
}
