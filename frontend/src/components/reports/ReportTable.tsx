import type { ReactNode } from "react";

export interface ReportColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  footer?: ReactNode; // the cell in the totals row
}

interface Props<T> {
  columns: ReportColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}

export default function ReportTable<T>({ columns, rows, rowKey, empty = "Nothing to show for this period." }: Props<T>) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        {empty}
      </p>
    );
  }

  const hasFooter = columns.some((column) => column.footer !== undefined);
  const alignClass = (column: ReportColumn<T>) => (column.align === "right" ? "text-right" : "text-left");

  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 font-medium ${alignClass(column)}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-gray-100 last:border-0">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 text-gray-700 ${alignClass(column)}`}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasFooter && (
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-leo-50 font-semibold text-gray-900">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${alignClass(column)}`}>
                  {column.footer ?? ""}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
