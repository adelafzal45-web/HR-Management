import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import EmptyState from "./EmptyState";

export type DataTableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  // Hide this column on narrow desktop widths (still shown in the mobile
  // card view) — useful for secondary metadata like "Created Date".
  hideBelow?: "md" | "lg" | "xl";
  align?: "left" | "right" | "center";
};

type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDescription?: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  actions?: (row: T) => React.ReactNode;
  toolbarRight?: React.ReactNode;
};

const HIDE_CLASS: Record<NonNullable<DataTableColumn<unknown>["hideBelow"]>, string> = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

const ALIGN_CLASS: Record<NonNullable<DataTableColumn<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// Windowed page-number list with ellipsis — e.g. for page 7 of 20:
// [1, "…", 6, 7, 8, "…", 20]. Keeps pagination usable (and narrow) even
// with a lot of pages, on any screen size.
function buildPageWindow(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const result: (number | "ellipsis")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) result.push("ellipsis");
    result.push(p);
  });
  return result;
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pageWindow = useMemo(() => buildPageWindow(page, totalPages), [page, totalPages]);

  const navBtn = "flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-transparent disabled:hover:text-gray-500";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(1)} aria-label="First page" className={`${navBtn} hidden xs:flex`}>
        <ChevronsLeft size={15} />
      </button>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page" className={navBtn}>
        <ChevronLeft size={15} />
      </button>

      {/* Numbered pages — hidden on the smallest screens in favor of "Page X of Y" below */}
      <div className="hidden items-center gap-1 sm:flex">
        {pageWindow.map((p, i) =>
          p === "ellipsis" ? (
            <span key={`e-${i}`} className="flex min-h-9 min-w-9 items-center justify-center text-sm text-gray-300">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg text-sm font-medium transition ${
                p === page
                  ? "bg-gradient-to-r from-brand to-brand-dark text-gray-900 shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              {p}
            </button>
          ),
        )}
      </div>

      {/* Compact indicator for mobile */}
      <span className="min-w-[64px] text-center text-sm font-medium text-gray-700 sm:hidden">
        {page} / {totalPages}
      </span>

      <button type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page" className={navBtn}>
        <ChevronRight size={15} />
      </button>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(totalPages)}
        aria-label="Last page"
        className={`${navBtn} hidden xs:flex`}
      >
        <ChevronsRight size={15} />
      </button>
    </div>
  );
}

export default function DataTable<T>({
  columns,
  rows = [],
  rowKey,
  loading,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  emptyIcon,
  emptyTitle,
  emptyDescription,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  actions,
  toolbarRight,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="w-full rounded-lg bg-gray-100 py-2.5 pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
          />
        </label>
        {toolbarRight && <div className="flex shrink-0 items-center gap-2">{toolbarRight}</div>}
      </div>

      {/* Loading skeleton */}
      {loading ? (
        <div className="space-y-3 p-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <>
          {/* Desktop / tablet table — sticky header, zebra rows, scrolls
              horizontally rather than ever overflowing the viewport */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3.5 font-semibold ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ""} ${col.align ? ALIGN_CLASS[col.align] : ""}`}
                    >
                      {col.label}
                    </th>
                  ))}
                  {actions && <th className="px-4 py-3.5 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={rowKey(row)}
                    className={`border-b border-gray-50 transition-colors last:border-0 hover:bg-brand-light/20 ${
                      i % 2 === 1 ? "bg-gray-50/40" : "bg-white"
                    }`}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3.5 align-middle text-gray-700 ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ""} ${col.align ? ALIGN_CLASS[col.align] : ""}`}
                      >
                        {col.render(row)}
                      </td>
                    ))}
                    {actions && <td className="px-4 py-3.5 text-right">{actions(row)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile — stacked cards (never overflow the viewport) */}
          <div className="divide-y divide-gray-50 sm:hidden">
            {rows.map((row) => (
              <div key={rowKey(row)} className="p-4">
                <div className="space-y-1.5">
                  {columns.map((col) => (
                    <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">{col.label}</span>
                      <span className="min-w-0 text-right text-gray-700">{col.render(row)}</span>
                    </div>
                  ))}
                </div>
                {actions && <div className="mt-3 flex justify-end gap-2 border-t border-gray-50 pt-3">{actions(row)}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Pagination */}
      {!loading && total > 0 && (
        <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-100 p-4 text-sm text-gray-500 lg:flex-row">
          <div className="flex w-full flex-col items-center gap-3 xs:flex-row xs:justify-between lg:w-auto lg:justify-start lg:gap-5">
            <p>
              Showing <span className="font-medium text-gray-700">{rangeStart}–{rangeEnd}</span> of{" "}
              <span className="font-medium text-gray-700">{total}</span>
            </p>
            {onPageSizeChange && (
              <label className="flex items-center gap-2 text-sm text-gray-500">
                Rows per page
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}
