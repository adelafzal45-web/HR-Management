// Reports (spec §14) — the payroll register. Pick a processed period and this
// reads GET /payslips/report?periodId= (server-side aggregate, never a
// recompute) and lays out three views of the same run: headline totals, a
// per-employee register, and the component/line roll-ups (tax, loan, each
// earning/deduction summed across the company). Read-only by design — the
// numbers are whatever the snapshot froze, so a report of a locked period is
// stable forever.

import { useEffect, useMemo, useState } from "react";
import { BarChart3, AlertTriangle, Download, FileSpreadsheet } from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  payrollPeriodsApi,
  type PayrollPeriod,
} from "@/modules/payroll/api/payrollPeriodsApi";
import {
  payslipsApi,
  type PayrollReport,
  type PayrollReportRow,
  type PayrollReportLineTotal,
} from "@/modules/payroll/api/payslipsApi";
import { money, humanize, registerFilename } from "@/modules/payroll/utils/format";

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-60 sm:max-w-md";

// A run only has a register once it has been processed — draft periods have no
// payslips to aggregate.
const HAS_PAYSLIPS: PayrollPeriod["status"][] = [
  "processing",
  "pending_approval",
  "approved",
  "locked",
  "paid",
];

// Turn the register into a CSV the browser downloads client-side (no backend
// export route needed — the report payload already holds every row).
function toCsv(report: PayrollReport): string {
  const header = [
    "Employee",
    "Basic",
    "Gross",
    "Earnings",
    "Deductions",
    "Tax",
    "Loan",
    "Net",
  ];
  const rows = report.rows.map((r) => [
    r.employee_name,
    r.basic_salary,
    r.gross_salary,
    r.total_earnings,
    r.total_deductions,
    r.tax,
    r.loan,
    r.net_salary,
  ]);
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((line) => line.map(escape).join(",")).join("\n");
}

export default function PayrollReportsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // The register is a plain aggregate — search and paginate it client-side.
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    payrollPeriodsApi
      .list()
      .then((all) => {
        const runnable = all.filter((p) => HAS_PAYSLIPS.includes(p.status));
        setPeriods(runnable);
        if (runnable.length > 0) setPeriodId(runnable[0].period_id);
      })
      .catch(() => toast.showError("Couldn't load periods."))
      .finally(() => setLoadingPeriods(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!periodId) {
      setReport(null);
      return;
    }
    setLoadingReport(true);
    setError(null);
    payslipsApi
      .report(periodId)
      .then(setReport)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Couldn't load the register."),
      )
      .finally(() => setLoadingReport(false));
  }, [periodId]);

  useEffect(() => setPage(1), [periodId, search, pageSize]);

  const filteredRows = useMemo(() => {
    const rows = report?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.employee_name.toLowerCase().includes(q));
  }, [report, search]);

  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * pageSize, page * pageSize),
    [filteredRows, page, pageSize],
  );

  const downloadCsv = () => {
    if (!report) return;
    const blob = new Blob([toCsv(report)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = report.period?.name ?? "payroll";
    a.href = url;
    a.download = `payroll-register-${name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Excel is built server-side from the same persisted payslips this screen
  // reads, so the workbook and the table on screen can never disagree.
  const downloadExcel = async () => {
    if (!periodId) return;
    setDownloading(true);
    try {
      await payslipsApi.downloadWorkbook(
        periodId,
        registerFilename(report?.period?.name ?? "payroll"),
      );
      toast.showSuccess("Excel register downloaded.");
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't build the Excel file.");
    } finally {
      setDownloading(false);
    }
  };

  const columns: DataTableColumn<PayrollReportRow>[] = [
    {
      key: "employee_name",
      label: "Employee",
      render: (r) => <span className="font-medium text-gray-900">{r.employee_name}</span>,
    },
    {
      key: "gross_salary",
      label: "Gross",
      render: (r) => <span className="tabular-nums text-gray-700">{money(r.gross_salary)}</span>,
      align: "right",
      hideBelow: "md",
    },
    {
      key: "tax",
      label: "Tax",
      render: (r) => <span className="tabular-nums text-gray-600">{money(r.tax)}</span>,
      align: "right",
      hideBelow: "lg",
    },
    {
      key: "loan",
      label: "Loan",
      render: (r) => <span className="tabular-nums text-gray-600">{money(r.loan)}</span>,
      align: "right",
      hideBelow: "lg",
    },
    {
      key: "total_deductions",
      label: "Deductions",
      render: (r) => (
        <span className="tabular-nums text-rose-600">{money(r.total_deductions)}</span>
      ),
      align: "right",
      hideBelow: "md",
    },
    {
      key: "net_salary",
      label: "Net Pay",
      render: (r) => (
        <span className="font-semibold tabular-nums text-gray-900">{money(r.net_salary)}</span>
      ),
      align: "right",
    },
  ];

  const totalCards = useMemo(() => {
    if (!report) return [];
    return [
      ["Employees", String(report.employee_count)],
      ["Gross", money(report.totals.gross)],
      ["Earnings", money(report.totals.earnings)],
      ["Tax", money(report.totals.tax)],
      ["Loans", money(report.totals.loan)],
      ["Net Pay", money(report.totals.net)],
    ] as const;
  }, [report]);

  return (
    <PayrollLayout activeTab="/payroll/reports">
      <BackendStatusBanner status={status} />

      {/* Period picker */}
      <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="block w-full sm:w-auto sm:flex-1">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Pay Period</span>
            <select
              className={selectClass}
              value={periodId}
              disabled={loadingPeriods || periods.length === 0}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {periods.length === 0 && <option value="">No processed periods</option>}
              {periods.map((p) => (
                <option key={p.period_id} value={p.period_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {report?.period && <StatusBadge status={report.period.status} />}
          {/* Excel first — it is the file payroll actually works from (one sheet
              per view, a column per component). CSV stays for anyone piping the
              rows into something else. */}
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!report || report.rows.length === 0 || downloading}
            className="flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileSpreadsheet size={16} /> {downloading ? "Building…" : "Export Excel"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!report || report.rows.length === 0}
            className="flex min-h-11 items-center gap-2 rounded-full border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <p className="flex items-center gap-2 text-sm font-medium text-rose-600">
            <AlertTriangle size={16} /> {error}
          </p>
        </div>
      ) : !periodId && !loadingPeriods ? (
        <EmptyState
          icon={BarChart3}
          title="No processed periods yet"
          description="Process a pay period to generate its payroll register, then come back to review company-wide totals here."
        />
      ) : (
        <div className="space-y-6">
          {/* Totals */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(loadingReport ? [] : totalCards).map(([label, val]) => (
              <div key={label} className="rounded-2xl bg-white px-4 py-4 shadow-sm ring-1 ring-gray-100">
                <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
                <p className="mt-1 text-sm font-semibold text-gray-900 tabular-nums">{val}</p>
              </div>
            ))}
            {loadingReport &&
              [...Array(6)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
              ))}
          </section>

          {/* Register */}
          <DataTable
            columns={columns}
            rows={pagedRows}
            rowKey={(r) => r.payslip_id}
            loading={loadingReport}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search employees…"
            emptyIcon={BarChart3}
            emptyTitle="No payslips in this run"
            emptyDescription="This period has no generated payslips to report on."
            page={page}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100]}
            total={filteredRows.length}
            onPageChange={setPage}
          />

          {/* Line roll-ups */}
          {report && report.line_totals.length > 0 && (
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
              <h3 className="mb-4 text-sm font-semibold text-gray-900">Component totals</h3>
              <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
                {report.line_totals.map((lt: PayrollReportLineTotal) => (
                  <div
                    key={`${lt.type}-${lt.label}`}
                    className="flex items-center justify-between border-b border-gray-50 py-2.5 last:border-0"
                  >
                    <span className="flex items-center gap-2 text-sm text-gray-700">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          lt.type === "deduction" ? "bg-rose-400" : "bg-emerald-400"
                        }`}
                      />
                      {lt.label}
                      <span className="text-xs text-gray-400">
                        ({lt.count} · {humanize(lt.type)})
                      </span>
                    </span>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        lt.type === "deduction" ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {money(lt.total)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PayrollLayout>
  );
}
