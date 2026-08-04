import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Clock, FileSpreadsheet, GitCompare, ShieldCheck } from "lucide-react";

import DataTable, {
  type DataTableColumn,
  type SortDirection,
} from "@/components/tables/DataTable";
import StatusBadge from "@/components/common/StatusBadge";
import { useAuth } from "@/app/providers/AuthContext";
import AppraisalFilterBar from "./AppraisalFilterBar";
import ReviewApprovalDialog from "./ReviewApprovalDialog";
import {
  appraisalStatsApi,
  type AppraisalStatsFilters,
  type ResultRow,
} from "@/modules/appraisal/api/appraisalApi";

/*
 * Only these ten fields are sortable, because `applySort` in
 * appraisal-stats.service.ts whitelists exactly these and silently falls back to
 * review_date for anything else. Marking a column sortable that the server does
 * not recognise would render a control that appears to work and does nothing.
 */
const EVALUATION_TYPE_OPTIONS = [
  { value: "Daily", label: "Daily" },
  { value: "Weekly", label: "Weekly" },
  { value: "Monthly", label: "Monthly" },
];

const STATUS_OPTIONS = [
  { value: "Draft", label: "Draft" },
  { value: "Submitted", label: "Submitted" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Rejected" },
];

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

  const [filters, setFilters] = useState<AppraisalStatsFilters>({});
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

  // Typing a name should not fire a query per keystroke against a joined,
  // paginated aggregate.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(timer);
  }, [search]);

  /*
   * The DataTable's column filters and the shared filter bar write to the same
   * two keys (`evaluationType`, `status`), so the dropdown in the table header
   * and the one in the filter bar always agree instead of fighting each other.
   */
  const tableFilters = useMemo(
    () => ({
      evaluationType: filters.evaluationType ?? "",
      status: filters.status ?? "",
    }),
    [filters.evaluationType, filters.status],
  );

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
      filterable: true,
      filterOptions: EVALUATION_TYPE_OPTIONS,
      filterPlaceholder: "All types",
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
      filterable: true,
      filterOptions: STATUS_OPTIONS,
      filterPlaceholder: "All statuses",
      align: "center",
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  /*
   * The workflow column is appended rather than declared inline so it simply
   * does not exist without `appraisal.approve` — a disabled button would still
   * advertise an action this user can never take.
   */
  if (canApprove) {
    columns.push({
      key: "workflow",
      label: "Workflow",
      align: "center",
      render: (row) => (
        <button
          type="button"
          onClick={() => setWorkflowRow(row)}
          aria-label={`Open workflow for ${row.employeeName}`}
          title="Approve, reject or reopen"
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
        >
          <ShieldCheck size={13} />
          Review
        </button>
      ),
    });
  }

  return (
    <div>
      <AppraisalFilterBar
        value={filters}
        onChange={setFilters}
        right={
          canExport ? (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
            >
              {exporting ? <Clock size={14} /> : <FileSpreadsheet size={14} />}
              {exporting ? "Exporting…" : "Excel"}
            </button>
          ) : null
        }
      />

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
        filters={tableFilters}
        onFiltersChange={(next) =>
          setFilters((prev) => ({
            ...prev,
            evaluationType: (next.evaluationType || undefined) as
              | AppraisalStatsFilters["evaluationType"]
              | undefined,
            status: next.status || undefined,
          }))
        }
        unifiedFilter
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
          canCompare && selected.length > 0 ? (
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
          ) : null
        }
      />

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
