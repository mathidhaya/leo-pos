import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchCategories } from "../../api/reports";
import type { CategoryRow, TabProps } from "../../types/reports";
import { formatMoney } from "../../utils/format";
import ReportTable, { type ReportColumn } from "./ReportTable";
import { ReportError, ReportSkeleton } from "./ReportStatus";
import ShareBar from "./ShareBar";

export default function CategoriesTab({ from, to }: TabProps) {
  const query = useQuery({
    queryKey: ["reports", "categories", from, to],
    queryFn: () => fetchCategories({ from, to }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <ReportSkeleton />;
  if (!query.data) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;

  const { rows, totals } = query.data;

  const columns: ReportColumn<CategoryRow>[] = [
    { key: "name", label: "Category", render: (r) => <span className="font-semibold text-gray-900">{r.name}</span>, footer: "Total" },
    { key: "quantity", label: "Qty sold", align: "right", render: (r) => r.quantity, footer: totals.quantity },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => formatMoney(r.revenue), footer: formatMoney(totals.revenue) },
    { key: "discount", label: "Discount", align: "right", render: (r) => formatMoney(r.discount), footer: formatMoney(totals.discount) },
    { key: "cost", label: "Cost", align: "right", render: (r) => formatMoney(r.cost), footer: formatMoney(totals.cost) },
    {
      key: "profit",
      label: "Profit",
      align: "right",
      render: (r) => (
        <span className={`font-semibold ${Number(r.profit) < 0 ? "text-red-600" : "text-gray-900"}`}>{formatMoney(r.profit)}</span>
      ),
      footer: formatMoney(totals.profit),
    },
    { key: "share", label: "Share of sales", align: "right", render: (r) => <ShareBar percent={r.sharePercent} /> },
  ];

  return (
    <div className={`space-y-4 ${query.isPlaceholderData ? "opacity-60" : ""}`}>
      <p className="text-sm text-gray-600">Share is each category's part of net sales (revenue after discount).</p>
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="No sales in this period." />
    </div>
  );
}
