import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, IndianRupee, RotateCcw, Smartphone, Wallet, type LucideIcon } from "lucide-react";
import { fetchPayments } from "../../api/reports";
import type { MethodName, TabProps } from "../../types/reports";
import { formatMoney } from "../../utils/format";
import StatCard from "../dashboard/StatCard";
import { ReportError, ReportSkeleton } from "./ReportStatus";

const METHOD: Record<MethodName, { label: string; Icon: LucideIcon; tone: "blue" | "green" | "amber" | "gray" }> = {
  CASH: { label: "Cash", Icon: Banknote, tone: "blue" },
  UPI: { label: "UPI", Icon: Smartphone, tone: "green" },
  CARD: { label: "Card", Icon: CreditCard, tone: "amber" },
  OTHER: { label: "Other", Icon: Wallet, tone: "gray" },
};

export default function PaymentsTab({ from, to }: TabProps) {
  const query = useQuery({
    queryKey: ["reports", "payments", from, to],
    queryFn: () => fetchPayments({ from, to }),
    placeholderData: keepPreviousData,
  });

  if (query.isPending) return <ReportSkeleton />;
  if (!query.data) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;

  const { rows, summary } = query.data;

  return (
    <div className={`space-y-4 ${query.isPlaceholderData ? "opacity-60" : ""}`}>
      <section aria-label="Payment totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard
          label="Total collected"
          value={formatMoney(summary.collected)}
          icon={IndianRupee}
          tone="green"
          hint={`${summary.payments} payment${summary.payments === 1 ? "" : "s"}`}
        />
        {rows.map((row) => {
          const { label, Icon, tone } = METHOD[row.method];
          const share = row.sharePercent === null ? "" : ` · ${row.sharePercent.toFixed(1)}% of sales`;
          return (
            <StatCard
              key={row.method}
              label={label}
              value={formatMoney(row.total)}
              icon={Icon}
              tone={tone}
              hint={`${row.payments} payment${row.payments === 1 ? "" : "s"}${share}`}
            />
          );
        })}
        <StatCard
          label="Refunded"
          value={formatMoney(summary.refunds.total)}
          icon={RotateCcw}
          tone="red"
          hint={`${summary.refunds.count} order${summary.refunds.count === 1 ? "" : "s"}, not counted above`}
        />
      </section>
      <p className="text-sm text-gray-600">Counts paid orders only. Refunded orders are shown separately.</p>
    </div>
  );
}
