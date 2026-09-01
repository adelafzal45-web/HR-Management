import { useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
 Search,
 ChevronUp,
 ChevronDown,
 ChevronsUpDown,
 Filter,
 X,
 AlertTriangle,
 RefreshCw,
} from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import { Pagination } from "@/components/ui";

/** Options for a column's dropdown filter. */
export type DataTableFilterOption = {
 value: string;
 label: string;
};

export type DataTableColumn<T> = {
 key: string;
 label: string;
 render: (row: T) => React.ReactNode;
 // Hide this column on narrow desktop widths (still shown in the mobile
 // card view) — useful for secondary metadata like "Created Date".
 hideBelow?: "md" | "lg" | "xl";
 align?: "left" | "right" | "center";
 /**
  * Makes the header a sort toggle. The parent performs the actual sorting —
  * usually by handing `sortKey`/`sortDir` to the API — because the table only
  * ever holds one page of rows and sorting them locally would reorder that page
  * instead of the result set.
  */
 sortable?: boolean;
 /**
  * Server-side sort field, when it differs from `key`. `key` is a display
  * concern; this is what the API expects in `sortBy`.
  */
 sortKey?: string;
 /** Renders a dropdown filter for this column in the filter bar. */
 filterable?: boolean;
 filterOptions?: DataTableFilterOption[];
 filterPlaceholder?: string;
};

export type SortDirection = "ASC" | "DESC";

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
 /**
  * When set, the table renders an error panel — with a Retry button when
  * `onRetry` is given — in place of rows or the empty state. Pass a
  * user-facing message, e.g. from `describeError()`. Loading takes precedence,
  * so a retry in progress shows the skeleton rather than the stale error. This
  * is what keeps a failed fetch from masquerading as "no results".
  */
 error?: string | null;
 onRetry?: () => void;
 page: number;
 pageSize: number;
 total: number;
 onPageChange: (page: number) => void;
 onPageSizeChange?: (pageSize: number) => void;
 pageSizeOptions?: number[];
 actions?: (row: T) => React.ReactNode;
 toolbarRight?: React.ReactNode;
 /**
  * Sorting. Both are needed for headers to become interactive: a `sortKey` with
  * no handler would render a control that silently does nothing.
  */
 sortKey?: string | null;
 sortDir?: SortDirection;
 onSortChange?: (key: string, dir: SortDirection) => void;
 /**
  * Column filters, keyed by the column's `key`. An empty string means "no
  * filter" and is omitted from the active-filter count.
  */
 filters?: Record<string, string>;
 onFiltersChange?: (filters: Record<string, string>) => void;
 /**
  * Use the unified filter panel (one Filter button opening a modal) instead of
  * the legacy inline filter bar. Opt-in so existing tables stay unchanged.
  */
 unifiedFilter?: boolean;
 /**
  * Sort options for the unified filter. Pair with `unifiedFilter: true`.
  */
 sortOptions?: Array<{ value: string; label: string }>;
 /**
  * Drops the Ascending/Descending select from the filter popover, leaving only
  * the field picker. The column headers already toggle direction, so on tables
  * whose headers are sortable this select was a second control for the same
  * thing — and reading it as a "filter" is what made people expect it to be
  * cleared by "Clear all".
  */
 hideSortDirection?: boolean;
 /**
  * Extra controls rendered inside the unified filter popover, below the column
  * dropdowns. For filters a plain `<select>` cannot express — searchable
  * multi-selects, date ranges — that still belong in the same compact popup
  * rather than a second filter bar.
  */
 extraFilters?: React.ReactNode;
 /**
  * How many of `extraFilters` are currently set, so the trigger badge and the
  * "N filters active" line stay truthful. Without it those controls would be
  * invisible to the count.
  */
 extraFilterCount?: number;
 /** Reset handler for `extraFilters`, invoked by "Clear all". */
 onClearExtraFilters?: () => void;
 /**
  * When rows come pre-sorted so that related rows sit next to each other
  * (e.g. several leave-balance rows for the same employee), returning that
  * shared key here switches zebra striping from per-row to per-group and
  * adds a divider above each new group — so a repeated value the caller has
  * blanked out in its own `render` (see the "employee" column pattern) still
  * reads as one visual block instead of a run of empty cells.
  */
 rowGroupKey?: (row: T) => string;
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

// Shown in place of rows when a fetch fails. Same footprint as EmptyState so
// the table doesn't jump, but a rose tone and a Retry make clear this is a
// failure to recover from — not "no data". The message comes from the caller
// (typically describeError), so it reflects the real status, never a guess.
function TableErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
 return (
 <div className="flex flex-col items-center justify-center gap-3 rounded-card bg-surface px-6 py-14 text-center shadow-card ring-1 ring-border-muted">
 <span className="flex h-14 w-14 items-center justify-center rounded-card bg-error-tint text-error">
 <AlertTriangle size={24} />
 </span>
 <p className="text-sm font-semibold text-foreground">Couldn't load this data</p>
 <p className="max-w-sm text-sm text-muted">{message}</p>
 {onRetry && (
 <button
 type="button"
 onClick={onRetry}
 className="mt-1 flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 py-2.5 text-sm font-semibold text-brand-contrast shadow-card transition hover:brightness-95"
 >
 <RefreshCw size={15} />
 Try again
 </button>
 )}
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
 error,
 onRetry,
 page,
 pageSize,
 total,
 onPageChange,
 onPageSizeChange,
 pageSizeOptions = [10, 25, 50],
 actions,
 toolbarRight,
 sortKey,
 sortDir = "DESC",
 onSortChange,
 filters,
 onFiltersChange,
 unifiedFilter = false,
 sortOptions,
 hideSortDirection = false,
 extraFilters,
 extraFilterCount = 0,
 onClearExtraFilters,
 rowGroupKey,
}: DataTableProps<T>) {
 const [panelOpen, setPanelOpen] = useState(false);
 const panelAnchorRef = useRef<HTMLDivElement>(null);

 // Outside-click and Escape dismissal for the filter popover. Without it the
 // only way out is the trigger, which reads as stuck.
 useEffect(() => {
  if (!panelOpen) return;

  const onDown = (event: MouseEvent) => {
   if (!panelAnchorRef.current?.contains(event.target as Node)) setPanelOpen(false);
  };
  const onKey = (event: KeyboardEvent) => {
   if (event.key === "Escape") setPanelOpen(false);
  };

  document.addEventListener("mousedown", onDown);
  document.addEventListener("keydown", onKey);
  return () => {
   document.removeEventListener("mousedown", onDown);
   document.removeEventListener("keydown", onKey);
  };
 }, [panelOpen]);

 // Group index per row (increments each time rowGroupKey changes from the
 // previous row) — drives per-group zebra striping and the divider above
 // each new group, instead of the plain per-row alternation used otherwise.
 const groupIndexes = useMemo(() => {
  if (!rowGroupKey) return null;
  const indexes: number[] = [];
  let current = -1;
  let lastKey: string | null = null;
  for (const row of rows) {
   const key = rowGroupKey(row);
   if (key !== lastKey) {
    current += 1;
    lastKey = key;
   }
   indexes.push(current);
  }
  return indexes;
 }, [rows, rowGroupKey]);

 const totalPages = Math.max(1, Math.ceil(total / pageSize));
 const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
 const rangeEnd = Math.min(page * pageSize, total);

 const filterColumns = useMemo(
  () => columns.filter((col) => col.filterable && col.filterOptions?.length),
  [columns],
 );
 const activeFilters = useMemo(
  () => Object.entries(filters ?? {}).filter(([, value]) => value !== ""),
  [filters],
 );
 const canFilter = Boolean(onFiltersChange) && filterColumns.length > 0;

 /*
  * When the unified filter is on, the search box and every column filter live
  * in the modal, so the active-filter count on the trigger includes them all.
  *
  * Sort is deliberately *not* counted. It never hides a row, and counting it
  * broke "Clear all": every table here ships a default sort field, so the badge
  * sat permanently at 1 and clearing the filters could not bring it back to
  * zero — which read as a filter that refused to clear.
  */
 const unifiedCount = useMemo(() => {
  if (!unifiedFilter) return 0;
  let count = 0;
  if (search.trim()) count++;
  count += activeFilters.length;
  count += extraFilterCount;
  return count;
 }, [unifiedFilter, search, activeFilters.length, extraFilterCount]);

 const clearAll = () => {
  onSearchChange("");
  onFiltersChange?.({});
  onClearExtraFilters?.();
 };

 const sortFieldFor = (col: DataTableColumn<T>) => col.sortKey ?? col.key;

 const handleSort = (col: DataTableColumn<T>) => {
  if (!onSortChange || !col.sortable) return;
  const field = sortFieldFor(col);
  // First click on a new column starts descending — for scores and dates that
  // is the interesting end. Clicking the active column flips direction.
  const nextDir: SortDirection =
   sortKey === field ? (sortDir === "ASC" ? "DESC" : "ASC") : "DESC";
  onSortChange(field, nextDir);
 };

 const renderSortIcon = (col: DataTableColumn<T>) => {
  if (!col.sortable || !onSortChange) return null;
  const active = sortKey === sortFieldFor(col);
  if (!active) return <ChevronsUpDown size={13} className="text-muted-foreground" />;
  return sortDir === "ASC" ? (
   <ChevronUp size={13} className="text-brand-dark" />
  ) : (
   <ChevronDown size={13} className="text-brand-dark" />
  );
 };

 return (
 <div className="overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-border-muted">
 {/* Toolbar */}
 <div className="flex flex-col gap-3 border-b border-border-muted p-4 sm:flex-row sm:items-center sm:justify-between">
 {unifiedFilter ? (
 <div className="flex items-center gap-2">
 <div ref={panelAnchorRef} className="relative">
 <button
 type="button"
 onClick={() => setPanelOpen((prev) => !prev)}
 aria-label="Open filters"
 aria-expanded={panelOpen}
 className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
 unifiedCount > 0
 ? "border-brand/60 bg-brand-light/40 text-brand-dark"
 : "border-border bg-surface text-foreground hover:border-brand/60 hover:text-brand-dark"
 }`}
 >
 <Filter size={15} />
 Filter
 {unifiedCount > 0 && (
 <span className="rounded-full bg-brand-dark px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
 {unifiedCount}
 </span>
 )}
 </button>

 {/*
  * Anchored popover rather than a centred modal, so the rows stay
  * visible while filters change and the effect of a change can be
  * seen without dismissing anything first. Capped height with its own
  * scroll keeps the footer reachable on short viewports.
  */}
 {panelOpen && (
 <div className="absolute left-0 top-full z-40 mt-2 max-h-[min(70vh,32rem)] w-[min(92vw,34rem)] overflow-y-auto rounded-xl border border-border bg-surface p-4 shadow-card-lg">
 <div className="mb-3 flex items-center justify-between gap-3">
 <h4 className="text-sm font-semibold text-foreground">Filters</h4>
 <button
 type="button"
 onClick={() => setPanelOpen(false)}
 aria-label="Close filters"
 className="rounded-lg p-1 text-muted-foreground transition hover:bg-surface-muted hover:text-foreground"
 >
 <X size={15} />
 </button>
 </div>

 <div className="space-y-3">
 <label className="block">
 <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
 Search
 </span>
 <input
 type="search"
 value={search}
 onChange={(e) => onSearchChange(e.target.value)}
 placeholder={searchPlaceholder}
 className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
 />
 </label>

 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 {sortOptions && sortOptions.length > 0 && onSortChange && (
 <>
 <label className={`block ${hideSortDirection ? "sm:col-span-2" : ""}`}>
 <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
 Sort by
 </span>
 <select
 value={sortKey ?? ""}
 onChange={(e) => onSortChange(e.target.value, sortDir ?? "DESC")}
 className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
 >
 {sortOptions.map((opt) => (
 <option key={opt.value} value={opt.value}>
 {opt.label}
 </option>
 ))}
 </select>
 </label>
 {!hideSortDirection && (
 <label className="block">
 <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
 Direction
 </span>
 <select
 value={sortDir ?? "DESC"}
 onChange={(e) =>
 onSortChange(sortKey ?? sortOptions[0].value, e.target.value as SortDirection)
 }
 className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
 >
 <option value="DESC">Descending</option>
 <option value="ASC">Ascending</option>
 </select>
 </label>
 )}
 </>
 )}

 {filterColumns.map((col) => (
 <label key={col.key} className="block">
 <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
 {col.label}
 </span>
 <select
 value={filters?.[col.key] ?? ""}
 onChange={(e) => onFiltersChange?.({ ...(filters ?? {}), [col.key]: e.target.value })}
 className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
 >
 <option value="">{col.filterPlaceholder ?? `All ${col.label.toLowerCase()}`}</option>
 {col.filterOptions?.map((opt) => (
 <option key={opt.value} value={opt.value}>
 {opt.label}
 </option>
 ))}
 </select>
 </label>
 ))}
 </div>

 {extraFilters && <div className="space-y-3">{extraFilters}</div>}

 <div className="flex items-center justify-between gap-3 border-t border-border-muted pt-3">
 <span className="text-xs text-muted">
 {unifiedCount === 0
 ? "No filters applied"
 : `${unifiedCount} filter${unifiedCount === 1 ? "" : "s"} active`}
 </span>
 <div className="flex gap-2">
 {unifiedCount > 0 && (
 <button
 type="button"
 onClick={clearAll}
 className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted transition hover:bg-background"
 >
 Clear all
 </button>
 )}
 <button
 type="button"
 onClick={() => setPanelOpen(false)}
 className="rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-xs font-semibold text-brand-contrast shadow-card transition hover:brightness-95"
 >
 Done
 </button>
 </div>
 </div>
 </div>
 </div>
 )}
 </div>
 {unifiedCount > 0 && (
 <button
 type="button"
 onClick={clearAll}
 className="text-xs font-medium text-muted transition hover:text-error"
 >
 Clear all
 </button>
 )}
 </div>
 ) : (
 <label className="relative block w-full sm:max-w-xs">
 <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
 <input
 type="search"
 value={search}
 onChange={(e) => onSearchChange(e.target.value)}
 placeholder={searchPlaceholder}
 aria-label={searchPlaceholder}
 className="w-full rounded-lg bg-surface-muted py-2.5 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/60"
 />
 </label>
 )}
 {toolbarRight && <div className="flex shrink-0 items-center gap-2">{toolbarRight}</div>}
 </div>

 {/* Column filters — parent-driven, so they compose with server-side paging */}
 {canFilter && !unifiedFilter && (
 <div className="flex flex-wrap items-end gap-3 border-b border-border-muted bg-background/50 px-4 py-3">
 {filterColumns.map((col) => (
 <label key={col.key} className="flex min-w-[150px] flex-col gap-1">
 <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{col.label}</span>
 <select
 value={filters?.[col.key] ?? ""}
 onChange={(e) => onFiltersChange?.({ ...(filters ?? {}), [col.key]: e.target.value })}
 className="rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
 >
 <option value="">{col.filterPlaceholder ?? `All ${col.label.toLowerCase()}`}</option>
 {col.filterOptions?.map((opt) => (
 <option key={opt.value} value={opt.value}>
 {opt.label}
 </option>
 ))}
 </select>
 </label>
 ))}

 {activeFilters.length > 0 && (
 <button
 type="button"
 onClick={() => onFiltersChange?.({})}
 className="mb-0.5 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted transition hover:border-brand/60 hover:text-brand-dark"
 >
 <X size={14} />
 Clear {activeFilters.length === 1 ? "filter" : `filters (${activeFilters.length})`}
 </button>
 )}
 </div>
 )}

 {/* Loading skeleton */}
 {loading ? (
 <div className="space-y-3 p-4">
 {[...Array(5)].map((_, i) => (
 <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-muted" />
 ))}
 </div>
 ) : error ? (
 <div className="p-4">
 <TableErrorState message={error} onRetry={onRetry} />
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
 <thead className="sticky top-0 z-10">
 {/* Opaque bg (not /80) and an inset bottom border rather than `border-b`:
 a translucent sticky header shows the rows sliding under it, and
 borders on a sticky element scroll away with the cell box. */}
 <tr className="bg-background text-xs font-semibold uppercase tracking-wide text-muted shadow-[inset_0_-1px_0_0_rgb(var(--color-border-muted))]">
 {columns.map((col) => {
 const isSortable = Boolean(col.sortable && onSortChange);
 const isActiveSort = isSortable && sortKey === sortFieldFor(col);
 return (
 <th
 key={col.key}
 aria-sort={
 isActiveSort ? (sortDir === "ASC" ? "ascending" : "descending") : undefined
 }
 className={`px-4 py-3.5 font-semibold ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ""} ${col.align ? ALIGN_CLASS[col.align] : ""}`}
 >
 {isSortable ? (
 <button
 type="button"
 onClick={() => handleSort(col)}
 className={`flex items-center gap-1.5 font-semibold uppercase tracking-wide transition hover:text-foreground ${
 col.align === "right" ? "ml-auto" : col.align === "center" ? "mx-auto" : ""
 } ${isActiveSort ? "text-brand-dark" : "text-muted"}`}
 >
 {col.label}
 {renderSortIcon(col)}
 </button>
 ) : (
 col.label
 )}
 </th>
 );
 })}
 {actions && <th className="px-4 py-3.5 text-right font-semibold">Actions</th>}
 </tr>
 </thead>
 <tbody>
 {rows.map((row, i) => {
 const groupIndex = groupIndexes ? groupIndexes[i] : i;
 const isNewGroup = groupIndexes ? i > 0 && groupIndexes[i] !== groupIndexes[i - 1] : false;
 return (
 <tr
 key={rowKey(row)}
 className={`border-b border-border-muted transition-colors last:border-0 hover:bg-brand-light/20 ${
 groupIndex % 2 === 1 ? "bg-background/40" : "bg-surface"
 } ${isNewGroup ? "border-t-2 border-t-border" : ""}`}
 >
 {columns.map((col) => (
 <td
 key={col.key}
 className={`px-4 py-3.5 align-middle text-foreground ${col.hideBelow ? HIDE_CLASS[col.hideBelow] : ""} ${col.align ? ALIGN_CLASS[col.align] : ""}`}
 >
 {col.render(row)}
 </td>
 ))}
 {actions && <td className="px-4 py-3.5 text-right">{actions(row)}</td>}
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {/* Mobile — stacked cards (never overflow the viewport). Groups get the
 same divider treatment as the desktop table, via a top border on the
 card instead of the row. */}
 <div className="divide-y divide-border-muted sm:hidden">
 {rows.map((row, i) => {
 const isNewGroup = groupIndexes ? i > 0 && groupIndexes[i] !== groupIndexes[i - 1] : false;
 return (
 <div key={rowKey(row)} className={`p-4 ${isNewGroup ? "border-t-2 border-t-border" : ""}`}>
 <div className="space-y-1.5">
 {columns.map((col) => (
 <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
 <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">{col.label}</span>
 <span className="min-w-0 text-right text-foreground">{col.render(row)}</span>
 </div>
 ))}
 </div>
 {actions && <div className="mt-3 flex justify-end gap-2 border-t border-border-muted pt-3">{actions(row)}</div>}
 </div>
 );
 })}
 </div>
 </>
 )}

 {/* Pagination */}
 {!loading && !error && total > 0 && (
 <div className="flex flex-col items-center justify-between gap-3 border-t border-border-muted p-4 text-sm text-muted lg:flex-row">
 <div className="flex w-full flex-col items-center gap-3 xs:flex-row xs:justify-between lg:w-auto lg:justify-start lg:gap-5">
 <p>
 Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of{" "}
 <span className="font-medium text-foreground">{total}</span>
 </p>
 {onPageSizeChange && (
 <label className="flex items-center gap-2 text-sm text-muted">
 Rows per page
 <select
 value={pageSize}
 onChange={(e) => onPageSizeChange(Number(e.target.value))}
 className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/60"
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
