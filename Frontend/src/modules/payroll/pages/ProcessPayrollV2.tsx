// Process Payroll (spec §11/§14) — the run screen. Two halves that share a
// selected period:
//
//  1. PREVIEW (no persist): pick one employee, compute their payslip and show
//     every line with its "Why?" note (calc_note) in an expander, so HR can
//     sanity-check the engine before committing anything.
//  2. GENERATE (persist): process the whole period — the backend creates a
//     payslip for every active employee and returns how many were generated vs
//     skipped, plus any warnings.
//
// The period can be preselected via ?period=<id> (Pay Periods "Process" button
// deep-links here). Only draft periods can be generated; once processed the
// period advances to pending_approval and generation is disabled.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PlayCircle,
  Eye,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { payrollPeriodsApi, type PayrollPeriod, type PeriodRunResult } from "@/modules/payroll/api/payrollPeriodsApi";
import { payslipsApi, type PayslipPreview, type ComputedLine } from "@/modules/payroll/api/payslipsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { money, shortDate } from "@/modules/payroll/utils/format";

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60 disabled:opacity-60";

// Only a draft period can be processed into payslips.
const isProcessable = (p: PayrollPeriod | null) => !!p && p.status === "draft";

function LineRow({ line, currency }: { line: ComputedLine; currency: string }) {
  const [open, setOpen] = useState(false);
  const isDeduction = line.type === "deduction";
  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 py-3 text-left transition hover:bg-gray-50/60"
      >
        <ChevronDown
          size={15}
          className={`shrink-0 text-gray-300 transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-gray-900">{line.label}</span>
          {line.code && <span className="block font-mono text-xs text-gray-400">{line.code}</span>}
        </span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            isDeduction ? "text-rose-600" : "text-emerald-700"
          }`}
        >
          {isDeduction ? "−" : "+"}
          {money(Math.abs(line.amount), currency)}
        </span>
      </button>
      {open && (
        <div className="ml-8 pb-3 pr-3">
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
            <span className="font-semibold text-gray-500">Why? </span>
            {line.calc_note || "No explanation recorded for this line."}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProcessPayrollV2Page() {
  const status = useBackendStatus();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);

  const [periodId, setPeriodId] = useState<string>(searchParams.get("period") ?? "");
  const [userId, setUserId] = useState<string>("");

  const [preview, setPreview] = useState<PayslipPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runResult, setRunResult] = useState<PeriodRunResult | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingLists(true);
    Promise.all([
      payrollPeriodsApi.list().catch(() => [] as PayrollPeriod[]),
      employeesApi.list({ status: "active", pageSize: 500 }).then((r) => r.data).catch(() => [] as Employee[]),
    ])
      .then(([p, e]) => {
        if (!active) return;
        setPeriods(p);
        setEmployees(e);
      })
      .catch(() => active && toast.showError("Couldn't load periods or employees."))
      .finally(() => active && setLoadingLists(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.period_id === periodId) ?? null,
    [periods, periodId],
  );

  // Keep the URL in sync so the screen is shareable / refresh-safe.
  const onPeriodChange = (id: string) => {
    setPeriodId(id);
    setPreview(null);
    setPreviewError(null);
    setRunResult(null);
    setSearchParams(id ? { period: id } : {}, { replace: true });
  };

  const currency = preview?.currency ?? "PKR";

  const runPreview = async () => {
    if (!periodId || !userId) return;
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    try {
      const res = await payslipsApi.preview({ user_id: userId, period_id: periodId });
      setPreview(res);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Couldn't compute the preview.");
    } finally {
      setPreviewing(false);
    }
  };

  const runGenerate = async () => {
    if (!periodId) return;
    setGenerating(true);
    try {
      const res = await payrollPeriodsApi.process(periodId);
      setRunResult(res.run);
      // Reflect the advanced status locally so the Generate button disables.
      setPeriods((prev) => prev.map((p) => (p.period_id === periodId ? res.period : p)));
      toast.showSuccess(
        `Generated ${res.run.generated} payslip${res.run.generated === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't process the period.");
    } finally {
      setGenerating(false);
      setConfirmGenerate(false);
    }
  };

  const earnings = preview?.lines.filter((l) => l.type === "earning") ?? [];
  const deductions = preview?.lines.filter((l) => l.type === "deduction") ?? [];

  return (
    <PayrollLayout activeTab="/payroll/run">
      <BackendStatusBanner status={status} />

      {/* Selection bar */}
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Process Payroll</h2>
            <p className="mt-1 text-sm text-gray-500">
              Preview one employee's breakdown, then generate payslips for the whole period.
            </p>
          </div>
          {selectedPeriod && <StatusBadge status={selectedPeriod.status} />}
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Pay Period</span>
            <select
              className={selectClass}
              value={periodId}
              disabled={loadingLists}
              onChange={(e) => onPeriodChange(e.target.value)}
            >
              <option value="">Select a period…</option>
              {periods.map((p) => (
                <option key={p.period_id} value={p.period_id}>
                  {p.name} ({shortDate(p.period_start)} – {shortDate(p.period_end)})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">
              Employee <span className="font-normal text-gray-400">(preview)</span>
            </span>
            <select
              className={selectClass}
              value={userId}
              disabled={loadingLists}
              onChange={(e) => setUserId(e.target.value)}
            >
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.employeeId} value={e.employeeId}>
                  {e.firstName} {e.lastName}
                  {e.employeeCode ? ` — ${e.employeeCode}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={runPreview}
            disabled={!periodId || !userId || previewing}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-gray-200 px-5 text-sm font-semibold text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye size={16} /> {previewing ? "Computing…" : "Preview"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmGenerate(true)}
            disabled={!isProcessable(selectedPeriod) || generating}
            className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <PlayCircle size={16} /> {generating ? "Generating…" : "Generate Payslips"}
          </button>
          {selectedPeriod && !isProcessable(selectedPeriod) && (
            <span className="text-xs text-gray-400">
              Only draft periods can be generated — this one is {selectedPeriod.status.replace(/_/g, " ")}.
            </span>
          )}
        </div>
      </section>

      {/* Generate result */}
      {runResult && (
        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-900">Run complete</h3>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold text-emerald-700">{runResult.generated}</span> generated
                {runResult.skipped > 0 && (
                  <>
                    {" · "}
                    <span className="font-semibold text-gray-500">{runResult.skipped}</span> skipped
                  </>
                )}
                .
              </p>
              {runResult.warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {runResult.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Preview breakdown */}
      <section className="mt-6">
        {previewError ? (
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <p className="flex items-center gap-2 text-sm font-medium text-rose-600">
              <AlertTriangle size={16} /> {previewError}
            </p>
          </div>
        ) : previewing ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : preview ? (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
            {/* Header */}
            <div className="border-b border-gray-100 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{preview.employee_name}</h3>
                  <p className="mt-0.5 text-sm text-gray-500">
                    {preview.employee_code} · {preview.period_name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    Structure: {preview.structure_name ?? "—"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Net Pay</p>
                  <p className="text-2xl font-semibold tracking-tight text-gray-900">
                    {money(preview.net_salary, currency)}
                  </p>
                </div>
              </div>

              {/* Input chips — the attendance/leave figures that fed the engine */}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                {[
                  ["Working", preview.inputs.working_days],
                  ["Present", preview.inputs.present_days],
                  ["Absent", preview.inputs.absent_days],
                  ["Paid leave", preview.inputs.paid_leave_days],
                  ["Unpaid leave", preview.inputs.unpaid_leave_days],
                  ["Late", preview.inputs.late_count],
                  ["OT hrs", preview.inputs.overtime_hours],
                ].map(([label, val]) => (
                  <span key={label} className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                    {label}: <span className="font-semibold text-gray-800">{val}</span>
                  </span>
                ))}
              </div>

              {preview.warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {preview.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Lines */}
            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Earnings
                </h4>
                {earnings.length === 0 ? (
                  <p className="py-3 text-sm text-gray-400">No earnings.</p>
                ) : (
                  earnings.map((l) => (
                    <LineRow key={`${l.component_id}-${l.label}`} line={l} currency={currency} />
                  ))
                )}
                <div className="mt-2 flex justify-between border-t border-gray-100 pt-3 text-sm">
                  <span className="font-medium text-gray-500">Total Earnings</span>
                  <span className="font-semibold text-emerald-700 tabular-nums">
                    {money(preview.total_earnings, currency)}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
                  Deductions
                </h4>
                {deductions.length === 0 ? (
                  <p className="py-3 text-sm text-gray-400">No deductions.</p>
                ) : (
                  deductions.map((l) => (
                    <LineRow key={`${l.component_id}-${l.label}`} line={l} currency={currency} />
                  ))
                )}
                <div className="mt-2 flex justify-between border-t border-gray-100 pt-3 text-sm">
                  <span className="font-medium text-gray-500">Total Deductions</span>
                  <span className="font-semibold text-rose-600 tabular-nums">
                    {money(preview.total_deductions, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer totals */}
            <div className="flex flex-wrap items-center justify-end gap-x-8 gap-y-2 border-t border-gray-100 p-6 text-sm">
              <span className="text-gray-500">
                Basic <span className="ml-1 font-semibold text-gray-800">{money(preview.basic_salary, currency)}</span>
              </span>
              <span className="text-gray-500">
                Gross <span className="ml-1 font-semibold text-gray-800">{money(preview.gross_salary, currency)}</span>
              </span>
              <span className="text-gray-900">
                Net <span className="ml-1 text-base font-semibold">{money(preview.net_salary, currency)}</span>
              </span>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No preview yet"
            description="Pick a period and an employee, then Preview to see the line-by-line breakdown with a 'Why?' for every line."
          />
        )}
      </section>

      <ConfirmDialog
        open={confirmGenerate}
        title={`Generate payslips for "${selectedPeriod?.name}"?`}
        description="This creates a payslip for every active employee in the period and advances it to pending approval. You can still preview individuals first."
        confirmLabel="Generate"
        loading={generating}
        onConfirm={runGenerate}
        onCancel={() => setConfirmGenerate(false)}
      />
    </PayrollLayout>
  );
}
