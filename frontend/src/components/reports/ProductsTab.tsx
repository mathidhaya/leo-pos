import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchProducts } from "../../api/reports";
import type { ProductRow, TabProps } from "../../types/reports";
import { formatMoney } from "../../utils/format";
import Alert from "../ui/Alert";
import SelectField from "../ui/SelectField";
import ReportTable, { type ReportColumn } from "./ReportTable";
import { ReportError, ReportSkeleton } from "./ReportStatus";

type SortKey = "revenue" | "quantity" | "profit" | "name";

function sortRows(rows: ProductRow[], key: SortKey): ProductRow[] {
  const sorted = [...rows];
  if (key === "name") return sorted.sort((a, b) => a.name.localeCompare(b.name));
  if (key === "quantity") return sorted.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  return sorted.sort((a, b) => Number(b[key]) - Number(a[key]) || a.name.localeCompare(b.name));
}

export default function ProductsTab({ from, to }: TabProps) {
  const [sort, setSort] = useState<SortKey>("revenue");

  const query = useQuery({
    queryKey: ["reports", "products", from, to],
    queryFn: () => fetchProducts({ from, to }),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => sortRows(query.data?.rows ?? [], sort), [query.data, sort]);

  if (query.isPending) return <ReportSkeleton />;
  if (!query.data) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;

  const { totals, truncated } = query.data;

  const columns: ReportColumn<ProductRow>[] = [
    {
      key: "name",
      label: "Product",
      render: (r) => (
        <div>
          <p className="font-semibold text-gray-900">{r.name}</p>
          <p className="text-xs text-gray-500">
            {r.sku} &middot; {r.category}
          </p>
        </div>
      ),
      footer: "Total",
    },
    { key: "quantity", label: "Qty sold", align: "right", render: (r) => r.quantity, footer: totals.quantity },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => formatMoney(r.revenue), footer: formatMoney(totals.revenue) },
    { key: "discount", label: "Discount", align: "right", render: (r) => formatMoney(r.discount), footer: formatMoney(totals.discount) },
    { key: "cost", label: "Cost", align: "right", render: (r) => formatMoney(r.cost), footer: formatMoney(totals.cost) },
    {
      key: "profit",
      label: "Profit",
      align: "right",
      render: (r) => (
        <div>
          <span className={`font-semibold ${Number(r.profit) < 0 ? "text-red-600" : "text-gray-900"}`}>{formatMoney(r.profit)}</span>
          {r.marginPercent !== null && <p className="text-xs text-gray-500">{r.marginPercent.toFixed(1)}% margin</p>}
        </div>
      ),
      footer: formatMoney(totals.profit),
    },
  ];

  return (
    <div className={`space-y-4 ${query.isPlaceholderData ? "opacity-60" : ""}`}>
      {truncated && <Alert variant="info">Only the top 1000 products are shown.</Alert>}

      <div className="max-w-xs">
        <SelectField label="Sort by" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="revenue">Revenue (highest first)</option>
          <option value="quantity">Quantity sold</option>
          <option value="profit">Profit (highest first)</option>
          <option value="name">Name (A to Z)</option>
        </SelectField>
      </div>

      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} empty="No products were sold in this period." />
    </div>
  );
}
