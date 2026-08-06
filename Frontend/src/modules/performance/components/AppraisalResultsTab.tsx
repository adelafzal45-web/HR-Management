import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock,
  Download,
  Filter,
  GitCompare,
  ShieldCheck,
  RotateCcw,
  Eye,
  FileText,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserCheck,
} from "lucide-react";

import DataTable, {
  type DataTableColumn,
  type SortDirection,
} from "@/components/tables/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { useAuth } from "@/app/providers/AuthContext";
import AppraisalFilterBar from "./AppraisalFilterBar";
import ReviewApprovalDialog from "./ReviewApprovalDialog";
import ReviewFormDialog from "@/modules/appraisal/components/ReviewFormDialog";
import {
  appraisalStatsApi,
  type AppraisalStatsFilters,
  type ResultRow,
} from "@/modules/appraisal/api/appraisalApi";

/*
 * These fields are sortable because `applySort` in appraisal-stats.service.ts
 * whitelists exactly them and silently falls back to review_date for anything
 * else. Marking a column sortable that the server does not recognise would
 * render a control that appears to work and does nothing.
 */
function SummaryCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof BarChart3;
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    default: "bg-gray-100 text-gray-600",
    good: "bg-emerald-50 text-emerald-600",
    warn: "bg-amber-50 text-amber-600",
    bad: "bg-rose-50 text-rose-600",
  }[tone];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
  );
}

function scoreClass(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-rose-600";
}

/**
 * The results table.
 *
 * Sorting and column filters are both server-driven: the table holds one page,
 * so sorting it in the browser would reorder that page rather than the result
 * set. The column filters write into the same filter object the shared filter
 * bar and the Excel export use, which keeps a download consistent with whatever
 * is on screen.
 *
 * Selecting rows hands their `employeeId` values to the compare view — that is
 * what `employeeId` is carried on each row for; `/appraisal/compare` takes uuids
 * and the display code is not one.
 */
export default function AppraisalResultsTab({
  onError,
  onCompare,
  onNotice,
}: {
  onError: (err: unknown, fallback: string) => void;
  onCompare?: (employeeIds: string[]) => void;
  onNotice?: (message: string) => void;
}) {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("appraisal.export");
  const canCompare = hasPermission("appraisal.compare") && Boolean(onCompare);
  const canApprove = hasPermission("appraisal.approve");

  const [filters, setFilters] = useState<AppraisalStatsFilters>({ evaluationType: "Daily" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortKey, setSortKey] = useState<string>("reviewDate");
  const [sortDir, setSortDir] = useState<SortDirection>("DESC");
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [workflowRow, setWorkflowRow] = useState<ResultRow | null>(null);
  const [viewFormRow, setViewFormRow] = useState<ResultRow | null>(null);

  const activeFilterCount = Object.values(filters).filter((v) => v !== undefined && v !== "").length;

  // Typing a name should not fire a query per keystroke against a joined,
  // paginated aggregate.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    setLoading(true);
    appraisalStatsApi
      .getResults({
        ...filters,
        page,
        limit: pageSize,
        search: debouncedSearch || undefined,
        sortBy: sortKey,
        sortOrder: sortDir,
      })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch((err) => onError(err, "Could not load the appraisal results."))
      .finally(() => setLoading(false));
  }, [filters, page, pageSize, debouncedSearch, sortKey, sortDir, onError]);

  useEffect(load, [load]);

  // Any change to what is being asked for invalidates the current page number —
  // otherwise a narrowed filter can leave the view stranded on an empty page 7.
  useEffect(() => {
    setPage(1);
  }, [filters, debouncedSearch, pageSize, sortKey, sortDir]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await appraisalStatsApi.exportStatsExcel(filters);
    } catch (err) {
      onError(err, "Could not export the results.");
    } finally {
      setExporting(false);
    }
  };

  const toggleSelected = (employeeId: string) => {
    setSelected((prev) =>
      prev.includes(employeeId)
        ? prev.filter((id) => id !== employeeId)
        : // Six is the server-side cap on compare; refusing the seventh here
          // turns a 400 into a control that simply stops accepting more.
          prev.length >= 6
          ? prev
          : [...prev, employeeId],
    );
  };

  // Summary calculations from current page
  const summary = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.status === "Pending" || r.status === "Draft").length;
    const submitted = rows.filter((r) => r.status === "Submitted").length;
    const approved = rows.filter((r) => r.status === "Approved").length;
    const rejected = rows.filter((r) => r.status === "Rejected").length;
    const avgScore =
      rows.length > 0
        ? rows.reduce((sum, r) => sum + r.grossScore, 0) / rows.length
        : 0;
    return { total, pending, submitted, approved, rejected, avgScore };
  }, [rows]);

  const columns: DataTableColumn<ResultRow>[] = [
    {
      key: "employeeCode",
      label: "Emp. Code",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs text-gray-500">{row.employeeCode || "—"}</span>
      ),
    },
    {
      key: "employeeName",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          {canCompare && (
            <input
              type="checkbox"
              checked={selected.includes(row.employeeId)}
              onChange={() => toggleSelected(row.employeeId)}
              disabled={!row.employeeId}
              aria-label={`Select ${row.employeeName} for comparison`}
              className="h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand/60"
            />
          )}
          <span className="font-medium text-gray-900">{row.employeeName}</span>
        </div>
      ),
    },
    {
      key: "department",
      label: "Department",
      sortable: true,
      hideBelow: "lg",
      render: (row) => row.department || "—",
    },
    {
      key: "designation",
      label: "Designation",
      sortable: true,
      hideBelow: "xl",
      render: (row) => row.designation || "—",
    },
    {
      key: "evaluationType",
      label: "Evaluation Type",
      sortable: true,
      hideBelow: "md",
      render: (row) => row.evaluationType,
    },
    {
      key: "reviewPeriod",
      label: "Period",
      sortable: true,
      render: (row) => <span className="whitespace-nowrap">{row.reviewPeriod}</span>,
    },
    {
      key: "grossScore",
      label: "Gross Score",
      sortable: true,
      align: "right",
      render: (row) => (
        <span className={`font-semibold ${scoreClass(row.grossScore)}`}>
          {row.grossScore.toFixed(2)}%
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center",
      render: (row) => {
        // Display "Pending" instead of "Draft"
        const displayStatus = row.status === "Draft" ? "Pending" : row.status;
        return <StatusBadge status={displayStatus} />;
      },
    },
    {
      key: "viewForm",
      label: "Form",
      align: "center",
      render: (row) => (
        <button
          type="button"
          onClick={() => setViewFormRow(row)}
          title="View submitted form"
          aria-label={`View form for ${row.employeeName}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
        >
          <FileText size={13} />
          View
        </button>
      ),
    },
  ];

  /*
   * The workflow column is appended rather than declared inline so it simply
   * does not exist without `appraisal.approve` — a disabled button would still
   * advertise an action this user can never take.
   *
   * Button text changes based on status: "Reopen" for pending reviews,
   * "Review" for submitted, "View" for approved/rejected.
   */
  if (canApprove) {
    columns.push({
      key: "workflow",
      label: "Workflow",
      align: "center",
      render: (row) => {
        const buttonText =
          row.status === "Draft" || row.status === "Submitted" ? "Review" :
          row.status === "Approved" || row.status === "Rejected" ? "View" :
          "Reopen";
        const buttonIcon =
          row.status === "Approved" || row.status === "Rejected" ? <Eye size={13} /> :
          row.status === "Draft" ? <RotateCcw size={13} /> :
          <ShieldCheck size={13} />;

        return (
          <button
            type="button"
            onClick={() => setWorkflowRow(row)}
            aria-label={`${buttonText} workflow for ${row.employeeName}`}
            title={row.status === "Approved" || row.status === "Rejected" ? "View submitted form" : "Approve, reject or reopen"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
          >
            {buttonIcon}
            {buttonText}
          </button>
        );
      },
    });
  }

  return (
    <div>
      {/* Summary cards */}
      {!loading && rows.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard icon={FileText} label="Total Reviews" value={summary.total} />
          <SummaryCard icon={AlertCircle} label="Pending" value={summary.pending} tone="warn" />
          <SummaryCard icon={UserCheck} label="Submitted" value={summary.submitted} tone="default" />
          <SummaryCard icon={CheckCircle2} label="Approved" value={summary.approved} tone="good" />
          <SummaryCard icon={XCircle} label="Rejected" value={summary.rejected} tone="bad" />
          <SummaryCard
            icon={BarChart3}
            label="Avg Score"
            value={`${summary.avgScore.toFixed(1)}%`}
            tone="good"
          />
        </div>
      )}

      <DataTable<ResultRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.reviewId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name or employee code…"
        emptyIcon={BarChart3}
        emptyTitle="No results"
        emptyDescription="No evaluations match the current filters."
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortChange={(key, dir) => {
          setSortKey(key);
          setSortDir(dir);
        }}
        sortOptions={[
          { value: "employeeCode", label: "Employee code" },
          { value: "employeeName", label: "Name" },
          { value: "department", label: "Department" },
          { value: "designation", label: "Designation" },
          { value: "evaluationType", label: "Evaluation type" },
          { value: "reviewPeriod", label: "Period" },
          { value: "grossScore", label: "Gross score" },
          { value: "status", label: "Status" },
        ]}
        toolbarRight={
          <div className="flex items-center gap-2">
            {canCompare && selected.length > 0 && (
              <button
                type="button"
                onClick={() => onCompare?.(selected)}
                disabled={selected.length < 2}
                title={
                  selected.length < 2
                    ? "Select at least two employees to compare"
                    : `Compare ${selected.length} employees`
                }
                className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand to-brand-dark px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <GitCompare size={14} />
                Compare ({selected.length})
              </button>
            )}

            {/* Filter popup */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setFiltersOpen((open) => !open)}
                title="Filters"
                aria-label="Filters"
                aria-expanded={filtersOpen}
                className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                  filtersOpen || activeFilterCount > 0
                    ? "border-brand/60 bg-brand-light/20 text-brand-dark"
                    : "border-gray-200 text-gray-600 hover:border-brand/60 hover:bg-gray-50 hover:text-brand-dark"
                }`}
              >
                <Filter size={16} />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-gray-900">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {filtersOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden
                    tabIndex={-1}
                    onClick={() => setFiltersOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div className="absolute right-0 z-40 mt-2 w-[min(90vw,34rem)] rounded-2xl border border-gray-100 bg-white p-4 shadow-xl">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                        <Filter size={15} className="text-gray-400" />
                        Filters
                      </span>
                    </div>
                    <AppraisalFilterBar value={filters} onChange={setFilters} variant="bare" />
                  </div>
                </>
              )}
            </div>

            {/* Export icon-only */}
            {canExport && (
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || loading}
                title="Export to Excel"
                aria-label="Export to Excel"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:border-brand/60 hover:bg-gray-50 hover:text-brand-dark disabled:opacity-50"
              >
                {exporting ? <Clock size={16} className="animate-spin" /> : <Download size={16} />}
              </button>
            )}
          </div>
        }
      />

      {viewFormRow && (
        <ReviewFormDialog
          reviewId={viewFormRow.reviewId}
          employeeName={viewFormRow.employeeName}
          onClose={() => setViewFormRow(null)}
          onError={onError}
        />
      )}

      {workflowRow && (
        <ReviewApprovalDialog
          reviewId={workflowRow.reviewId}
          employeeName={workflowRow.employeeName}
          reviewPeriod={workflowRow.reviewPeriod}
          status={workflowRow.status}
          canAct={canApprove}
          onClose={() => setWorkflowRow(null)}
          onDone={(message) => {
            onNotice?.(message);
            // The row's status changed underneath the table, so refetch rather
            // than patch a copy — a status filter may now exclude it entirely.
            load();
          }}
          onError={onError}
        />
      )}
    </div>
  );
}
