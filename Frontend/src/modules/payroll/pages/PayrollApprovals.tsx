// Approvals (spec §1 workflow) — the Administrator's queue. When HR processes a
// period it advances to `pending_approval`; only an Administrator (payroll.approve)
// can move it to `approved`, after which it can be locked. This screen is the
// focused view of that queue — every period awaiting a decision, with the run's
// register (from payslipsApi.report) surfaced so the approver sees the totals
// they're signing off before they click.
//
// It reuses the Phase 1 period state machine end-to-end: approve = the existing
// POST /payroll-periods/:id/approve. There is no separate "reject" transition in
// the backend — a period that shouldn't be approved is sent back by the approver
// asking HR to correct and re-process, so we surface Approve + a "View run"
// drill-in rather than inventing a reject state the engine doesn't model.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCheck,
  CheckCircle2,
  Lock,
  ShieldAlert,
  ChevronRight,
  Users,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import {
  payrollPeriodsApi,
  type PayrollPeriod,
} from "@/modules/payroll/api/payrollPeriodsApi";
import { payslipsApi, type PayrollReport } from "@/modules/payroll/api/payslipsApi";
import { money, shortDate } from "@/modules/payroll/utils/format";

// The workflow states this screen acts on. `pending_approval` needs a decision;
// `approved` is shown so the approver can immediately lock what they just cleared.
const ACTIONABLE: PayrollPeriod["status"][] = ["pending_approval", "approved"];

function PeriodCard({
  period,
  canApprove,
  busy,
  onApprove,
  onLock,
}: {
  period: PayrollPeriod;
  canApprove: boolean;
  busy: boolean;
  onApprove: () => void;
  onLock: () => void;
}) {
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [open, setOpen] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  const loadReport = useCallback(() => {
    if (report || loadingReport) return;
    setLoadingReport(true);
    payslipsApi
      .report(period.period_id)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoadingReport(false));
  }, [period.period_id, report, loadingReport]);

  const toggle = () => {
    setOpen((o) => {
      const next = !o;
      if (next) loadReport();
      return next;
    });
  };

  const pending = period.status === "pending_approval";

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <button
          type="button"
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronRight
            size={16}
            className={`shrink-0 text-gray-300 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <div className="min-w-0">
            <span className="block font-medium text-gray-900">{period.name}</span>
            <span className="block text-xs text-gray-400">
              {shortDate(period.period_start)} – {shortDate(period.period_end)}
              {period.processed_at ? ` · processed ${shortDate(period.processed_at)}` : ""}
            </span>
          </div>
        </button>

        <StatusBadge status={period.status} />

        <div className="flex items-center gap-2">
          {pending &&
            (canApprove ? (
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className="flex min-h-10 items-center gap-1.5 rounded-full bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 size={16} /> {busy ? "Approving…" : "Approve"}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                <ShieldAlert size={14} /> Awaits Administrator
              </span>
            ))}
          {period.status === "approved" && (
            <button
              type="button"
              onClick={onLock}
              disabled={busy}
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              <Lock size={15} /> {busy ? "Locking…" : "Lock"}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 p-5">
          {loadingReport ? (
            <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
          ) : report ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["Employees", String(report.employee_count)],
                ["Gross", money(report.totals.gross)],
                ["Deductions", money(report.totals.deductions)],
                ["Net Pay", money(report.totals.net)],
              ].map(([label, val]) => (
                <div key={label} className="rounded-xl bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 tabular-nums">{val}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No register available for this run yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PayrollApprovalsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const { hasPermission } = useAuth();
  const canApprove = hasPermission("payroll.approve");

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<PayrollPeriod | null>(null);

  const load = () => {
    setLoading(true);
    payrollPeriodsApi
      .list()
      .then(setPeriods)
      .catch(() => toast.showError("Couldn't load approvals."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queue = useMemo(
    () => periods.filter((p) => ACTIONABLE.includes(p.status)),
    [periods],
  );
  const pendingCount = queue.filter((p) => p.status === "pending_approval").length;

  const doApprove = async () => {
    if (!approveTarget) return;
    setBusyId(approveTarget.period_id);
    try {
      await payrollPeriodsApi.approve(approveTarget.period_id);
      toast.showSuccess(`${approveTarget.name} approved.`);
      setApproveTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't approve period.");
    } finally {
      setBusyId(null);
    }
  };

  const doLock = async (p: PayrollPeriod) => {
    setBusyId(p.period_id);
    try {
      await payrollPeriodsApi.lock(p.period_id);
      toast.showSuccess(`${p.name} locked.`);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't lock period.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PayrollLayout activeTab="/payroll/approvals">
      <BackendStatusBanner status={status} />

      <section className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
            <Users size={20} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-gray-900">Approval Queue</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {pendingCount === 0
                ? "Nothing is waiting on a decision."
                : `${pendingCount} run${pendingCount === 1 ? "" : "s"} awaiting ${
                    canApprove ? "your approval" : "an Administrator"
                  }.`}
            </p>
          </div>
        </div>
        {!canApprove && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            Approval is Administrator-only. You can review each run here, but the approve action
            is disabled for your role.
          </p>
        )}
      </section>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : queue.length === 0 ? (
        <EmptyState
          icon={CheckCheck}
          title="Approval queue is empty"
          description="Processed runs that need an Administrator's sign-off will appear here. Process a period from the Run screen to populate it."
        />
      ) : (
        <div className="space-y-3">
          {queue.map((p) => (
            <PeriodCard
              key={p.period_id}
              period={p}
              canApprove={canApprove}
              busy={busyId === p.period_id}
              onApprove={() => setApproveTarget(p)}
              onLock={() => doLock(p)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!approveTarget}
        title={`Approve "${approveTarget?.name}"?`}
        description="This clears the run for locking and payment. Make sure the register totals are correct — once locked, payslips are frozen."
        confirmLabel="Approve"
        loading={busyId === approveTarget?.period_id}
        onConfirm={doApprove}
        onCancel={() => setApproveTarget(null)}
      />
    </PayrollLayout>
  );
}
