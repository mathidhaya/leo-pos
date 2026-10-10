import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleX, Clock, IndianRupee, Plus, RefreshCw, ShoppingBag, TrendingUp } from "lucide-react";
import { fetchDashboard } from "../../api/dashboard";
import DashboardSkeleton from "../../components/dashboard/DashboardSkeleton";
import RangeSelector from "../../components/dashboard/RangeSelector";
import RecentOrders from "../../components/dashboard/RecentOrders";
import SalesChart from "../../components/dashboard/SalesChart";
import StatCard from "../../components/dashboard/StatCard";
import TopProducts from "../../components/dashboard/TopProducts";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { NAV_ITEMS } from "../../config/navigation";
import { useAuth } from "../../hooks/useAuth";
import type { RangeKey } from "../../types/dashboard";
import { getErrorMessage } from "../../utils/errors";
import { formatMoney, formatYmd, toYmd } from "../../utils/format";
import { getGreeting } from "../../utils/greeting";
import { ROLE_LABEL } from "../../utils/roles";

function defaultCustomRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 6);
  return { from: toYmd(from), to: toYmd(to) };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState(defaultCustomRange);

  const { data, isPending, isError, error, refetch, isFetching, isPlaceholderData, dataUpdatedAt } = useQuery({
    queryKey: ["dashboard", range, range === "custom" ? custom : null],
    queryFn: () => fetchDashboard(range === "custom" ? { range, ...custom } : { range }),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  if (!user) return null;

  const canCreateOrder = NAV_ITEMS.find((item) => item.path === "/pos")?.roles.includes(user.role) ?? false;

  if (isPending) return <DashboardSkeleton />;

  if (!data) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{isError ? getErrorMessage(error) : "Could not load the dashboard."}</Alert>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    );
  }

  const { today, rangeSummary, canViewProfit } = data;
  const rangeLabel =
    data.range.from === data.range.to
      ? formatYmd(data.range.from)
      : `${formatYmd(data.range.from)} to ${formatYmd(data.range.to)}`;
  const updatedAt = new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-6">
      {isError && <Alert variant="error">{getErrorMessage(error)} Showing the last loaded numbers.</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {getGreeting()}, {ROLE_LABEL[user.role]} 👋
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {user.shop.name} &middot; Updated {updatedAt}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-5 w-5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          {canCreateOrder && (
            <Link
              to="/pos"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-leo-600 px-6 text-base font-semibold text-white hover:bg-leo-700"
            >
              <Plus className="h-5 w-5" />
              New Order
            </Link>
          )}
        </div>
      </div>

      <section aria-label="Today" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard label="Today's Sales" value={formatMoney(today.sales)} icon={IndianRupee} tone="green" hint="Paid orders, GST included" />
        <StatCard label="Today's Orders" value={String(today.orders)} icon={ShoppingBag} tone="blue" hint="Not counting cancelled" />
        {canViewProfit && today.profit !== null && (
          <StatCard label="Today's Profit" value={formatMoney(today.profit)} icon={TrendingUp} tone="green" hint="After cost and discounts" />
        )}
        <StatCard label="Pending Orders" value={String(today.pending)} icon={Clock} tone="amber" hint="Being prepared or ready" />
        <StatCard label="Completed Orders" value={String(today.completed)} icon={CircleCheck} tone="green" />
        <StatCard label="Cancelled Orders" value={String(today.cancelled)} icon={CircleX} tone="red" />
      </section>

      <div className={`grid gap-6 lg:grid-cols-3 ${isPlaceholderData ? "opacity-60" : ""}`}>
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Sales overview</h2>
              <p className="text-sm text-gray-500">{rangeLabel}</p>
            </div>
            <dl className="flex gap-5 text-right">
              <div>
                <dt className="text-xs text-gray-500">Sales</dt>
                <dd className="font-semibold text-gray-900">{formatMoney(rangeSummary.sales)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Orders</dt>
                <dd className="font-semibold text-gray-900">{rangeSummary.orders}</dd>
              </div>
              {canViewProfit && rangeSummary.profit !== null && (
                <div>
                  <dt className="text-xs text-gray-500">Profit</dt>
                  <dd className="font-semibold text-gray-900">{formatMoney(rangeSummary.profit)}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mb-5">
            <RangeSelector
              range={range}
              onRangeChange={setRange}
              custom={custom}
              onApplyCustom={(from, to) => setCustom({ from, to })}
            />
          </div>

          <SalesChart series={data.series} canViewProfit={canViewProfit} />
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-gray-900">Top selling products</h2>
          <p className="mb-4 text-sm text-gray-500">{rangeLabel}</p>
          <TopProducts products={data.topProducts} />
        </section>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent orders</h2>
        <RecentOrders orders={data.recentOrders} />
      </section>
    </div>
  );
}
