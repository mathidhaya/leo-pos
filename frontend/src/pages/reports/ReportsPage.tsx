import { useState } from "react";
import { Download } from "lucide-react";
import { ReportDownloadError, downloadReport } from "../../api/reports";
import CategoriesTab from "../../components/reports/CategoriesTab";
import PaymentsTab from "../../components/reports/PaymentsTab";
import ProductsTab from "../../components/reports/ProductsTab";
import ProfitTab from "../../components/reports/ProfitTab";
import ReportRangePicker from "../../components/reports/ReportRangePicker";
import SalesTab from "../../components/reports/SalesTab";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import type { GroupBy, ReportFormat, ReportKind } from "../../types/reports";
import { saveBlob } from "../../utils/download";
import { getErrorMessage } from "../../utils/errors";
import { formatYmd } from "../../utils/format";
import { MAX_DAILY_DAYS, computeReportRange, rangeDays, type RangePreset } from "../../utils/reportRange";

const TABS: Array<{ key: ReportKind; label: string }> = [
  { key: "sales", label: "Sales" },
  { key: "profit", label: "Profit" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "payments", label: "Payments" },
];

const GROUPS: Array<{ key: GroupBy; label: string }> = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportKind>("sales");
  const [preset, setPreset] = useState<RangePreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");
  const [exporting, setExporting] = useState<ReportFormat | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const range = computeReportRange(preset, customFrom, customTo);
  const days = range.error ? 0 : rangeDays(range.from, range.to);
  const dayTooLong = days > MAX_DAILY_DAYS;
  // Grouping by day needs a range of a year or less, so longer ranges switch to weeks
  const effectiveGroupBy: GroupBy = groupBy === "day" && dayTooLong ? "week" : groupBy;
  const usesGroupBy = tab === "sales" || tab === "profit";

  function choosePreset(next: RangePreset) {
    setPreset(next);
    if (next === "year") setGroupBy("month");
  }

  async function handleExport(format: ReportFormat) {
    if (range.error || exporting) return;
    setExporting(format);
    setExportError(null);
    try {
      const blob = await downloadReport({ report: tab, format, from: range.from, to: range.to, groupBy: effectiveGroupBy });
      saveBlob(blob, `leo-cafe-${tab}-report-${range.from}_to_${range.to}.${format}`);
    } catch (err) {
      setExportError(err instanceof ReportDownloadError ? err.message : getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  }

  const tabProps = { from: range.from, to: range.to, groupBy: effectiveGroupBy };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Reports</h1>
          <p className="mt-1 text-sm text-gray-600">Sales, profit and payments, for any period.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void handleExport("csv")} loading={exporting === "csv"} disabled={Boolean(range.error) || exporting === "pdf"}>
            {exporting !== "csv" && <Download className="h-5 w-5" />}
            Export CSV
          </Button>
          <Button variant="secondary" onClick={() => void handleExport("pdf")} loading={exporting === "pdf"} disabled={Boolean(range.error) || exporting === "csv"}>
            {exporting !== "pdf" && <Download className="h-5 w-5" />}
            Export PDF
          </Button>
        </div>
      </div>

      {exportError && <Alert variant="error">{exportError}</Alert>}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Reports">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={[
              "h-11 rounded-full px-6 text-sm font-medium transition-colors",
              tab === item.key ? "bg-leo-600 text-white" : "border border-gray-300 bg-white text-gray-700 hover:bg-leo-50",
            ].join(" ")}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm" aria-label="Filters">
        <ReportRangePicker
          preset={preset}
          onPreset={choosePreset}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
          error={range.error}
        />

        {usesGroupBy && !range.error && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">Group by</p>
            <div className="inline-flex rounded-lg bg-gray-100 p-1" role="radiogroup" aria-label="Group by">
              {GROUPS.map((item) => {
                const disabled = item.key === "day" && dayTooLong;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={effectiveGroupBy === item.key}
                    disabled={disabled}
                    onClick={() => setGroupBy(item.key)}
                    className={[
                      "h-9 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      effectiveGroupBy === item.key ? "bg-white text-leo-700 shadow-sm" : "text-gray-600 hover:text-gray-900",
                    ].join(" ")}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {dayTooLong && <p className="mt-1.5 text-xs text-gray-500">Daily rows are only available for ranges of one year or less.</p>}
            {effectiveGroupBy === "week" && <p className="mt-1.5 text-xs text-gray-500">Weeks start on Monday. The first and last week can be partial.</p>}
          </div>
        )}

        {!range.error && (
          <p className="text-sm text-gray-600">
            Showing {formatYmd(range.from)}
            {range.from === range.to ? "" : ` to ${formatYmd(range.to)}`}
          </p>
        )}
      </section>

      {!range.error && tab === "sales" && <SalesTab {...tabProps} />}
      {!range.error && tab === "profit" && <ProfitTab {...tabProps} />}
      {!range.error && tab === "products" && <ProductsTab {...tabProps} />}
      {!range.error && tab === "categories" && <CategoriesTab {...tabProps} />}
      {!range.error && tab === "payments" && <PaymentsTab {...tabProps} />}
    </div>
  );
}
