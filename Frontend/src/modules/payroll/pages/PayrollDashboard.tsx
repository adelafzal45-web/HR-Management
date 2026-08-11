// Payroll dashboard (spec §Reports/overview) — the landing surface for the
// HR/Admin payroll workspace. Reads-only: it surfaces the current state of the
// engine (periods and their run status, how much configuration exists) and
// routes into the workflow, rather than inventing figures. Everything here is
// derived from real backend lists — no demo data.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarRange,
  Blocks,
  Layers,
  PlayCircle,
  ReceiptText,
  SlidersHorizontal,
  ArrowRight,
  Clock,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import StatusBadge from "@/components/common/StatusBadge";
import EmptyState from "@/components/common/EmptyState";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  payrollPeriodsApi,
  type PayrollPeriod,
  type SetupStatus,
} from "@/modules/payroll/api/payrollPeriodsApi";
import { payslipsApi, type PayrollReport } from "@/modules/payroll/api/payslipsApi";
import { salaryComponentsApi } from "@/modules/payroll/api/salaryComponentsApi";
import { salaryStructuresApi } from "@/modules/payroll/api/salaryStructuresApi";
import { money, shortDate } from "@/modules/payroll/utils/format";

// A run only has a register once it has been processed — draft periods have
// nothing to cost, so the money widgets look for the newest period past draft.
const COSTED: PayrollPeriod["status"][] = [
  "processing",
  "pending_approval",
  "approved",
  "locked",
  "paid",
];

type StatCard = {
  label: string;
  value: number | string;
  icon: typeof CalendarRange;
  to: string;
  hint?: string;
};

export default function PayrollDashboardPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [componentCount, setComponentCount] = useState<number | null>(null);
  const [structureCount, setStructureCount] = useState<number | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [latestReport, setLatestReport] = useState<PayrollReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      payrollPeriodsApi.list().catch(() => [] as PayrollPeriod[]),
      salaryComponentsApi.list().then((r) => r.length).catch(() => null),
      salaryStructuresApi.list().then((r) => r.length).catch(() => null),
      payrollPeriodsApi.setupStatus().catch(() => null),
    ])
      .then(([p, c, s, st]) => {
        if (!active) return;
        setPeriods(p);
        setComponentCount(c);
        setStructureCount(s);
        setSetup(st);
      })
      .catch(() => active && toast.showError("Couldn't load the payroll overview."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Newest period with an actual register, to surface its totals.
  const latestCosted = useMemo(
    () =>
      [...periods]
        .filter((p) => COSTED.includes(p.status))
        .sort((a, b) => (a.period_start < b.period_start ? 1 : -1))[0] ?? null,
    [periods],
  );

  useEffect(() => {
    if (!latestCosted) {
      setLatestReport(null);
      return;
    }
    let active = true;
    payslipsApi
      .report(latestCosted.period_id)
      .then((r) => active && setLatestReport(r))
      .catch(() => active && setLatestReport(null));
    return () => {
      active = false;
    };
  }, [latestCosted]);

  const setupRequired = setup?.checks.filter((c) => c.required).length ?? 0;
  const setupDone = setup?.checks.filter((c) => c.required && c.passed).length ?? 0;
  const setupPct =
    setupRequired > 0 ? Math.round((setupDone / setupRequired) * 100) : 0;
  const setupReady = setup?.ready ?? false;

  const pendingApproval = useMemo(
    () => periods.filter((p) => p.status === "pending_approval").length,
    [periods],
  );

  // Most recent periods first, by start date — the run workflow reads top-down.
  const recent = useMemo(
    () =>
      [...periods]
        .sort((a, b) => (a.period_start < b.period_start ? 1 : -1))
        .slice(0, 6),
    [periods],
  );

  const stats: StatCard[] = [
    {
      label: "Pay Periods",
      value: loading ? "—" : periods.length,
      icon: CalendarRange,
      to: "/payroll/periods",
      hint: pendingApproval > 0 ? `${pendingApproval} awaiting approval` : undefined,
    },
    {
      label: "Salary Components",
      value: loading || componentCount === null ? "—" : componentCount,
      icon: Blocks,
      to: "/payroll/components",
    },
    {
      label: "Salary Structures",
      value: loading || structureCount === null ? "—" : structureCount,
      icon: Layers,
      to: "/payroll/structures",
    },
  ];

  const quickLinks = [
    { label: "Process a period", description: "Preview and generate payslips", icon: PlayCircle, to: "/payroll/run" },
    { label: "View payslips", description: "Org-wide payslip register", icon: ReceiptText, to: "/payroll/payslips" },
    { label: "General settings", description: "Pay cycle, workflow & rounding", icon: SlidersHorizontal, to: "/payroll/settings" },
  ];

  return (
    <PayrollLayout activeTab="/payroll/dashboard">
      <BackendStatusBanner status={status} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              to={s.to}
              className="group rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 transition hover:ring-brand/40"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
                  <Icon size={18} />
                </span>
                <ArrowRight size={16} className="text-gray-300 transition group-hover:text-brand-dark" />
              </div>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
              {s.hint && <p className="mt-1 text-xs font-medium text-brand-dark">{s.hint}</p>}
            </Link>
          );
        })}
      </div>

      {/* Activation gate + latest run cost. The checklist is a hard gate on
          processing, so it leads; the money totals describe the newest run
          that actually has a register. */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <ListChecks size={17} className="text-brand" /> Activation
            </h2>
            <Link
              to="/payroll/setup"
              className="text-sm font-medium text-brand-dark transition hover:brightness-95"
            >
              Open
            </Link>
          </div>

          {loading ? (
            <div className="mt-4 h-20 animate-pulse rounded-xl bg-gray-100" />
          ) : !setup ? (
            <p className="mt-4 text-sm text-gray-500">Setup status unavailable.</p>
          ) : (
            <>
              <p className="mt-4 text-2xl font-semibold tracking-tight text-gray-900">
                {setupDone}
                <span className="text-base font-normal text-gray-400"> / {setupRequired}</span>
              </p>
              <p className="text-sm text-gray-500">required items complete</p>

              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100"
                role="progressbar"
                aria-valuenow={setupPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Payroll setup completeness"
              >
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    setupReady ? "bg-emerald-500" : "bg-amber-400"
                  }`}
                  style={{ width: `${setupPct}%` }}
                />
              </div>

              <p
                className={`mt-3 flex items-start gap-2 text-sm font-medium ${
                  setupReady ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {setupReady ? (
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                )}
                {setupReady
                  ? "Payroll is active — periods can be processed."
                  : "Finish the required items before processing a period."}
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Latest Run Cost</h2>
            <Link
              to="/payroll/reports"
              className="text-sm font-medium text-brand-dark transition hover:brightness-95"
            >
              Reports
            </Link>
          </div>

          {loading ? (
            <div className="mt-4 h-20 animate-pulse rounded-xl bg-gray-100" />
          ) : !latestCosted || !latestReport ? (
            <p className="mt-4 text-sm text-gray-500">
              No processed period yet. Totals appear once a run is generated.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-500">
                {latestCosted.name} · {latestReport.employee_count}{" "}
                {latestReport.employee_count === 1 ? "employee" : "employees"}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Gross", value: latestReport.totals.gross },
                  { label: "Tax", value: latestReport.totals.tax },
                  { label: "Loans", value: latestReport.totals.loan },
                  { label: "Net", value: latestReport.totals.net },
                ].map((t) => (
                  <div key={t.label} className="rounded-xl bg-gray-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      {t.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">
                      {money(t.value)}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent periods */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Recent Pay Periods</h2>
              <Link
                to="/payroll/periods"
                className="text-sm font-medium text-brand-dark transition hover:brightness-95"
              >
                View all
              </Link>
            </div>

            <div className="mt-4">
              {loading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <EmptyState
                  icon={CalendarRange}
                  title="No pay periods yet"
                  description="Create a pay period to start a payroll run."
                />
              ) : (
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                      <th className="pb-3 font-medium">Period</th>
                      <th className="pb-3 font-medium">Dates</th>
                      <th className="pb-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((p) => (
                      <tr key={p.period_id} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="py-3 text-gray-500">
                          {shortDate(p.period_start)} – {shortDate(p.period_end)}
                        </td>
                        <td className="py-3">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Quick Actions</h2>
          <div className="mt-4 flex flex-col gap-2">
            {quickLinks.map((q) => {
              const Icon = q.icon;
              return (
                <Link
                  key={q.to}
                  to={q.to}
                  className="group flex items-center gap-3 rounded-xl border border-gray-100 p-3 transition hover:border-brand/40 hover:bg-gray-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition group-hover:bg-brand-light group-hover:text-brand-dark">
                    <Icon size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">{q.label}</span>
                    <span className="block text-xs text-gray-500">{q.description}</span>
                  </span>
                  <ArrowRight size={15} className="text-gray-300 transition group-hover:text-brand-dark" />
                </Link>
              );
            })}
          </div>

          {pendingApproval > 0 && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              <Clock size={16} className="mt-0.5 shrink-0" />
              <span>
                {pendingApproval} {pendingApproval === 1 ? "period is" : "periods are"} awaiting
                approval. Review them under{" "}
                <Link to="/payroll/periods" className="font-semibold underline">
                  Pay Periods
                </Link>
                .
              </span>
            </div>
          )}
        </div>
      </div>
    </PayrollLayout>
  );
}
