import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
 Search,
 ChevronLeft,
 ChevronRight,
 ChevronsLeft,
 ChevronsRight,
 ArrowUp,
 ArrowDown,
 ArrowUpDown,
 Columns3,
 SlidersHorizontal,
 Download,
 Upload,
 X,
 GripVertical,
 FileText,
 FileSpreadsheet,
 FileType,
} from "lucide-react";
import EmptyState from "@/components/common/EmptyState";
import type { ExportFormat } from "@/utils/exportUtils";

export type GridColumn<T> = {
 key: string;
 label: string;
 render: (row: T) => ReactNode;
 /** Value to sort by — omit to make the column unsortable. */
 sortAccessor?: (row: T) => string | number;
 width: number;
 minWidth?: number;
 align?: "left" | "right" | "center";
 /** Always visible — excluded from the column-visibility menu. */
 locked?: boolean;
 /** Hidden by default, toggle-able from the Columns menu. */
 hiddenByDefault?: boolean;
};

export type FilterChip = { key: string; label: string; onRemove: () => void };

export type BulkAction<T> = {
 key: string;
 label: string;
 icon: LucideIcon;
 tone?: "default" | "danger";
 onClick: (ids: string[], rows: T[]) => void;
};

type Props<T> = {
 storageKey: string;
 columns: GridColumn<T>[];
 rows: T[];
 rowKey: (row: T) => string;
 loading?: boolean;
 search: string;
 onSearchChange: (value: string) => void;
 searchPlaceholder?: string;
 emptyIcon: LucideIcon;
 emptyTitle: string;
 emptyDescription?: string;
 pageSizeOptions?: number[];
 actions?: (row: T) => ReactNode;
 addButton?: ReactNode;
 onOpenFilters: () => void;
 activeFilterCount: number;
 filterChips: FilterChip[];
 onExport: (rowsToExport: T[], format: ExportFormat) => void;
 onImportClick: () => void;
 selectedIds: Set<string>;
 onSelectedIdsChange: (ids: Set<string>) => void;
 bulkActions: BulkAction<T>[];
 /** Optional — when provided, clicking anywhere on a row (outside the
 * checkbox/actions cells) invokes this instead of doing nothing. */
 onRowClick?: (row: T) => void;
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

const ALIGN_CLASS: Record<NonNullable<GridColumn<unknown>["align"]>, string> = {
 left: "text-left",
 right: "text-right",
 center: "text-center",
};

function loadJSON<T>(key: string, fallback: T): T {
 try {
 const raw = localStorage.getItem(key);
 return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
 } catch {
 return fallback;
 }
}

function saveJSON(key: string, value: unknown) {
 try {
 localStorage.setItem(key, JSON.stringify(value));
 } catch {
 // storage unavailable (private mode / quota) — column prefs just won't persist
 }
}

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

export default function EmployeeDataGrid<T>({
 storageKey,
 columns,
 rows,
 rowKey,
 loading,
 search,
 onSearchChange,
 searchPlaceholder = "Search…",
 emptyIcon,
 emptyTitle,
 emptyDescription,
 pageSizeOptions = [10, 25, 50, 100],
 actions,
 addButton,
 onOpenFilters,
 activeFilterCount,
 filterChips,
 onExport,
 onImportClick,
 selectedIds,
 onSelectedIdsChange,
 bulkActions,
 onRowClick,
}: Props<T>) {
 const widthKey = `${storageKey}.widths`;
 const visKey = `${storageKey}.visibility`;

 const [widths, setWidths] = useState<Record<string, number>>(() =>
 loadJSON(
 widthKey,
 Object.fromEntries(columns.map((c) => [c.key, c.width])),
 ),
 );
 const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
 loadJSON(
 visKey,
 Object.fromEntries(columns.map((c) => [c.key, !c.hiddenByDefault])),
 ),
 );
 const [sort, setSort] = useState<SortState>(null);
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(pageSizeOptions[0]);
 const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
 const columnsMenuRef = useRef<HTMLDivElement>(null);
 const [exportMenuOpen, setExportMenuOpen] = useState(false);
 const exportMenuRef = useRef<HTMLDivElement>(null);

 useEffect(() => saveJSON(widthKey, widths), [widthKey, widths]);
 useEffect(() => saveJSON(visKey, visibility), [visKey, visibility]);
 useEffect(() => setPage(1), [rows.length, search, sort, pageSize]);

 useEffect(() => {
 if (!columnsMenuOpen) return;
 const onClick = (e: MouseEvent) => {
 if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) setColumnsMenuOpen(false);
 };
 document.addEventListener("mousedown", onClick);
 return () => document.removeEventListener("mousedown", onClick);
 }, [columnsMenuOpen]);

 useEffect(() => {
 if (!exportMenuOpen) return;
 const onClick = (e: MouseEvent) => {
 if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
 };
 document.addEventListener("mousedown", onClick);
 return () => document.removeEventListener("mousedown", onClick);
 }, [exportMenuOpen]);

 const visibleColumns = useMemo(() => columns.filter((c) => c.locked || visibility[c.key] !== false), [columns, visibility]);

 const sortedRows = useMemo(() => {
 if (!sort) return rows;
 const col = columns.find((c) => c.key === sort.key);
 if (!col?.sortAccessor) return rows;
 const dir = sort.dir === "asc" ? 1 : -1;
 return [...rows].sort((a, b) => {
 const av = col.sortAccessor!(a);
 const bv = col.sortAccessor!(b);
 if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
 return String(av).localeCompare(String(bv)) * dir;
 });
 }, [rows, sort, columns]);

 const total = sortedRows.length;
 const totalPages = Math.max(1, Math.ceil(total / pageSize));
 const clampedPage = Math.min(page, totalPages);
 const rangeStart = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
 const rangeEnd = Math.min(clampedPage * pageSize, total);
 const pageRows = useMemo(
 () => sortedRows.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
 [sortedRows, clampedPage, pageSize],
 );

 const toggleSort = (key: string) => {
 setSort((prev) => {
 if (!prev || prev.key !== key) return { key, dir: "asc" };
 if (prev.dir === "asc") return { key, dir: "desc" };
 return null;
 });
 };

 const pageIds = pageRows.map(rowKey);
 const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
 const someOnPageSelected = pageIds.some((id) => selectedIds.has(id));

 const toggleSelectAllOnPage = () => {
 const next = new Set(selectedIds);
 if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
 else pageIds.forEach((id) => next.add(id));
 onSelectedIdsChange(next);
 };

 const toggleSelectRow = (id: string) => {
 const next = new Set(selectedIds);
 if (next.has(id)) next.delete(id);
 else next.add(id);
 onSelectedIdsChange(next);
 };

 const selectedRows = useMemo(() => rows.filter((r) => selectedIds.has(rowKey(r))), [rows, selectedIds, rowKey]);

 // ---- column resize -------------------------------------------------
 const resizeState = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

 const startResize = (key: string, e: React.MouseEvent) => {
 e.preventDefault();
 resizeState.current = { key, startX: e.clientX, startWidth: widths[key] ?? 150 };
 const onMove = (ev: MouseEvent) => {
 if (!resizeState.current) return;
 const { key: k, startX, startWidth } = resizeState.current;
 const col = columns.find((c) => c.key === k);
 const min = col?.minWidth ?? 80;
 const next = Math.max(min, startWidth + (ev.clientX - startX));
 setWidths((w) => ({ ...w, [k]: next }));
 };
 const onUp = () => {
 resizeState.current = null;
 window.removeEventListener("mousemove", onMove);
 window.removeEventListener("mouseup", onUp);
 };
 window.addEventListener("mousemove", onMove);
 window.addEventListener("mouseup", onUp);
 };

 const skeletonCols = visibleColumns.length + (actions ? 2 : 1);
 const navBtn =
 "flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-brand/60 hover:bg-brand-light/40 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:bg-transparent disabled:hover:text-gray-500";

 return (
 <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
 {/* Toolbar */}
 <div className="flex flex-col gap-3 border-b border-gray-100 p-4">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

 <div className="flex flex-wrap items-center gap-2">
 <button
 type="button"
 onClick={onOpenFilters}
 className={`relative flex min-h-10 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition ${
 activeFilterCount > 0
 ? "border-brand/60 bg-brand-light/40 text-brand-dark"
 : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
 }`}
 >
 <SlidersHorizontal size={15} /> Filters
 {activeFilterCount > 0 && (
 <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-dark px-1 text-[11px] font-semibold text-white">
 {activeFilterCount}
 </span>
 )}
 </button>

 <div className="relative" ref={columnsMenuRef}>
 <button
 type="button"
 onClick={() => setColumnsMenuOpen((o) => !o)}
 aria-expanded={columnsMenuOpen}
 className="flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
 >
 <Columns3 size={15} /> Columns
 </button>
 {columnsMenuOpen && (
 <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-gray-100 bg-white p-2 shadow-lg">
 <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Visible Columns</p>
 {columns
 .filter((c) => !c.locked)
 .map((c) => (
 <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
 <input
 type="checkbox"
 checked={visibility[c.key] !== false}
 onChange={(e) => setVisibility((v) => ({ ...v, [c.key]: e.target.checked }))}
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 {c.label}
 </label>
 ))}
 </div>
 )}
 </div>

 <button
 type="button"
 onClick={onImportClick}
 className="flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
 >
 <Upload size={15} /> Import
 </button>
 <div className="relative" ref={exportMenuRef}>
 <button
 type="button"
 onClick={() => setExportMenuOpen((o) => !o)}
 aria-expanded={exportMenuOpen}
 aria-haspopup="menu"
 className="flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
 >
 <Download size={15} /> Export
 </button>
 {exportMenuOpen && (
 <div role="menu" className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-gray-100 bg-white p-1.5 shadow-lg">
 {(
 [
 { format: "csv" as const, label: "Export as CSV", icon: FileText },
 { format: "excel" as const, label: "Export as Excel", icon: FileSpreadsheet },
 { format: "pdf" as const, label: "Export as PDF", icon: FileType },
 ]
 ).map((opt) => (
 <button
 key={opt.format}
 type="button"
 role="menuitem"
 onClick={() => {
 onExport(selectedRows.length > 0 ? selectedRows : sortedRows, opt.format);
 setExportMenuOpen(false);
 }}
 className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-gray-700 transition hover:bg-gray-50"
 >
 <opt.icon size={15} className="text-gray-400" /> {opt.label}
 </button>
 ))}
 </div>
 )}
 </div>

 {addButton}
 </div>
 </div>

 {/* Active filter chips */}
 {filterChips.length > 0 && (
 <div className="flex flex-wrap items-center gap-1.5">
 {filterChips.map((chip) => (
 <span
 key={chip.key}
 className="flex items-center gap-1.5 rounded-full bg-brand-light/60 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-dark"
 >
 {chip.label}
 <button
 type="button"
 onClick={chip.onRemove}
 aria-label={`Remove filter ${chip.label}`}
 className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-brand-dark/20"
 >
 <X size={11} />
 </button>
 </span>
 ))}
 </div>
 )}
 </div>

 {/* Bulk action bar */}
 {selectedIds.size > 0 && (
 <div className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand-light/30 px-4 py-2.5">
 <span className="text-sm font-medium text-brand-dark">{selectedIds.size} selected</span>
 <div className="ml-auto flex flex-wrap items-center gap-2">
 {bulkActions.map((ba) => (
 <button
 key={ba.key}
 type="button"
 onClick={() => ba.onClick([...selectedIds], selectedRows)}
 className={`flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
 ba.tone === "danger"
 ? "bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
 : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
 }`}
 >
 <ba.icon size={13} /> {ba.label}
 </button>
 ))}
 <button
 type="button"
 onClick={() => onSelectedIdsChange(new Set())}
 className="text-xs font-medium text-brand-dark hover:underline"
 >
 Clear
 </button>
 </div>
 </div>
 )}

 {/* Loading skeleton */}
 {loading ? (
 <div className="space-y-3 p-4">
 {[...Array(6)].map((_, i) => (
 <div key={i} className="flex items-center gap-3">
 {[...Array(skeletonCols)].map((__, j) => (
 <div key={j} className="h-11 flex-1 animate-pulse rounded-xl bg-gray-100" style={{ animationDelay: `${i * 40}ms` }} />
 ))}
 </div>
 ))}
 </div>
 ) : rows.length === 0 ? (
 <div className="p-4">
 <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
 </div>
 ) : (
 <>
 {/* Desktop / tablet — sticky header, resizable + sortable columns */}
 <div className="hidden max-h-[65vh] overflow-auto sm:block">
 <table className="w-full text-left text-sm" style={{ tableLayout: "fixed" }}>
 <colgroup>
 <col style={{ width: 44 }} />
 {visibleColumns.map((c) => (
 <col key={c.key} style={{ width: widths[c.key] ?? c.width }} />
 ))}
 {actions && <col style={{ width: 132 }} />}
 </colgroup>
 <thead className="sticky top-0 z-10">
 <tr className="border-b border-gray-100 bg-gray-50/95 text-xs font-semibold uppercase tracking-wide text-gray-500 backdrop-blur">
 <th className="px-4 py-3.5">
 <input
 type="checkbox"
 checked={allOnPageSelected}
 ref={(el) => {
 if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
 }}
 onChange={toggleSelectAllOnPage}
 aria-label="Select all rows on this page"
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 </th>
 {visibleColumns.map((col) => (
 <th key={col.key} className={`group relative select-none px-4 py-3.5 font-semibold ${col.align ? ALIGN_CLASS[col.align] : ""}`}>
 {col.sortAccessor ? (
 <button
 type="button"
 onClick={() => toggleSort(col.key)}
 className="flex items-center gap-1 hover:text-gray-700"
 >
 {col.label}
 {sort?.key === col.key ? (
 sort.dir === "asc" ? (
 <ArrowUp size={12} />
 ) : (
 <ArrowDown size={12} />
 )
 ) : (
 <ArrowUpDown size={12} className="opacity-30 group-hover:opacity-70" />
 )}
 </button>
 ) : (
 col.label
 )}
 <span
 onMouseDown={(e) => startResize(col.key, e)}
 className="absolute -right-1 top-1/2 z-10 h-5 w-2 -translate-y-1/2 cursor-col-resize touch-none opacity-0 group-hover:opacity-100"
 aria-hidden
 >
 <GripVertical size={12} className="text-gray-300" />
 </span>
 </th>
 ))}
 {actions && <th className="px-4 py-3.5 text-right font-semibold">Actions</th>}
 </tr>
 </thead>
 <tbody>
 {pageRows.map((row, i) => {
 const id = rowKey(row);
 const selected = selectedIds.has(id);
 return (
 <tr
 key={id}
 onClick={onRowClick ? () => onRowClick(row) : undefined}
 onKeyDown={
 onRowClick
 ? (e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 onRowClick(row);
 }
 }
 : undefined
 }
 tabIndex={onRowClick ? 0 : undefined}
 role={onRowClick ? "button" : undefined}
 className={`border-b border-gray-50 transition-colors last:border-0 hover:bg-brand-light/20 ${
 onRowClick ? "cursor-pointer" : ""
 } ${selected ? "bg-brand-light/30" : i % 2 === 1 ? "bg-gray-50/40" : "bg-white"}`}
 >
 <td className="px-4 py-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
 <input
 type="checkbox"
 checked={selected}
 onChange={() => toggleSelectRow(id)}
 aria-label="Select row"
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 </td>
 {visibleColumns.map((col) => (
 <td
 key={col.key}
 className={`overflow-hidden px-4 py-3.5 align-middle text-gray-700 ${col.align ? ALIGN_CLASS[col.align] : ""}`}
 >
 {col.render(row)}
 </td>
 ))}
 {actions && (
 <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
 {actions(row)}
 </td>
 )}
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>

 {/* Mobile — stacked cards */}
 <div className="divide-y divide-gray-50 sm:hidden">
 {pageRows.map((row) => {
 const id = rowKey(row);
 const selected = selectedIds.has(id);
 return (
 <div
 key={id}
 onClick={onRowClick ? () => onRowClick(row) : undefined}
 onKeyDown={
 onRowClick
 ? (e) => {
 if (e.key === "Enter" || e.key === " ") {
 e.preventDefault();
 onRowClick(row);
 }
 }
 : undefined
 }
 tabIndex={onRowClick ? 0 : undefined}
 role={onRowClick ? "button" : undefined}
 className={`p-4 ${onRowClick ? "cursor-pointer" : ""} ${selected ? "bg-brand-light/20" : ""}`}
 >
 <div className="mb-2 flex items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
 <input
 type="checkbox"
 checked={selected}
 onChange={() => toggleSelectRow(id)}
 aria-label="Select row"
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Select</span>
 </div>
 <div className="space-y-1.5">
 {visibleColumns.map((col) => (
 <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
 <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-gray-400">{col.label}</span>
 <span className="min-w-0 text-right text-gray-700">{col.render(row)}</span>
 </div>
 ))}
 </div>
 {actions && (
 <div className="mt-3 flex justify-end gap-2 border-t border-gray-50 pt-3" onClick={(e) => e.stopPropagation()}>
 {actions(row)}
 </div>
 )}
 </div>
 );
 })}
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
 <label className="flex items-center gap-2 text-sm text-gray-500">
 Rows per page
 <select
 value={pageSize}
 onChange={(e) => setPageSize(Number(e.target.value))}
 className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-brand/60"
 >
 {pageSizeOptions.map((size) => (
 <option key={size} value={size}>
 {size}
 </option>
 ))}
 </select>
 </label>
 </div>

 <div className="flex items-center gap-1.5">
 <button type="button" disabled={clampedPage <= 1} onClick={() => setPage(1)} aria-label="First page" className={`${navBtn} hidden xs:flex`}>
 <ChevronsLeft size={15} />
 </button>
 <button type="button" disabled={clampedPage <= 1} onClick={() => setPage(clampedPage - 1)} aria-label="Previous page" className={navBtn}>
 <ChevronLeft size={15} />
 </button>
 <div className="hidden items-center gap-1 sm:flex">
 {buildPageWindow(clampedPage, totalPages).map((p, i) =>
 p === "ellipsis" ? (
 <span key={`e-${i}`} className="flex min-h-9 min-w-9 items-center justify-center text-sm text-gray-300">
 …
 </span>
 ) : (
 <button
 key={p}
 type="button"
 onClick={() => setPage(p)}
 aria-label={`Page ${p}`}
 aria-current={p === clampedPage ? "page" : undefined}
 className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg text-sm font-medium transition ${
 p === clampedPage
 ? "bg-gradient-to-r from-brand to-brand-dark text-gray-900 shadow-sm"
 : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
 }`}
 >
 {p}
 </button>
 ),
 )}
 </div>
 <span className="min-w-[64px] text-center text-sm font-medium text-gray-700 sm:hidden">
 {clampedPage} / {totalPages}
 </span>
 <button type="button" disabled={clampedPage >= totalPages} onClick={() => setPage(clampedPage + 1)} aria-label="Next page" className={navBtn}>
 <ChevronRight size={15} />
 </button>
 <button
 type="button"
 disabled={clampedPage >= totalPages}
 onClick={() => setPage(totalPages)}
 aria-label="Last page"
 className={`${navBtn} hidden xs:flex`}
 >
 <ChevronsRight size={15} />
 </button>
 </div>
 </div>
 )}
 </div>
 );
}
