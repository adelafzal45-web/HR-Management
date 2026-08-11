// Activate Payroll — the setup checklist (spec §1 setup gate). Payroll
// processing is HARD-GATED server-side: a period can't be processed until every
// required item passes. This screen mirrors that gate read-only — it reads
// GET /payroll-periods/setup-status and shows each check with a "why it matters"
// detail, so HR knows exactly what's left before the first run.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ListChecks,
  CheckCircle2,
  Circle,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  payrollPeriodsApi,
  type SetupStatus,
  type SetupCheck,
} from "@/modules/payroll/api/payrollPeriodsApi";

// Each check maps to the screen that resolves it, so a failed row is a
// one-click jump to the fix rather than a dead end.
const FIX_LINK: Record<string, { to: string; label: string }> = {
  settings: { to: "/payroll/settings", label: "Open settings" },
  components: { to: "/payroll/components", label: "Add a component" },
  assignments: { to: "/payroll/structures", label: "Assign a structure" },
  tax: { to: "/payroll/tax", label: "Configure tax" },
};

function CheckRow({ check }: { check: SetupCheck }) {
  const fix = FIX_LINK[check.key];
  return (
    <li className="flex items-start gap-3 border-b border-gray-50 py-4 last:border-0">
      <span className="mt-0.5 shrink-0">
        {check.passed ? (
          <CheckCircle2 size={20} className="text-emerald-600" />
        ) : (
          <Circle size={20} className={check.required ? "text-rose-400" : "text-gray-300"} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{check.label}</span>
          {check.required ? (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-500">
              Required
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Optional
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">{check.detail}</p>
      </div>
      {!check.passed && fix && (
        <Link
          to={fix.to}
          className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-dark transition hover:bg-brand-light"
        >
          {fix.label} <ArrowRight size={14} />
        </Link>
      )}
    </li>
  );
}

export default function PayrollSetupPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const [data, setData] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    payrollPeriodsApi
      .setupStatus()
      .then(setData)
      .catch(() => toast.showError("Couldn't load the setup checklist."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requiredDone = data ? data.checks.filter((c) => c.required && c.passed).length : 0;
  const requiredTotal = data ? data.checks.filter((c) => c.required).length : 0;

  return (
    <PayrollLayout activeTab="/payroll/setup">
      <BackendStatusBanner status={status} />

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : !data ? (
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <p className="flex items-center gap-2 text-sm font-medium text-rose-600">
            <AlertTriangle size={16} /> Setup status is unavailable.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Readiness banner */}
          <section
            className={`rounded-2xl p-6 shadow-sm ring-1 ${
              data.ready
                ? "bg-emerald-50 ring-emerald-100"
                : "bg-amber-50 ring-amber-100"
            }`}
          >
            <div className="flex items-start gap-4">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  data.ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {data.ready ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-gray-900">
                  {data.ready ? "Payroll is ready to run" : "Setup incomplete"}
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                  {data.ready
                    ? "All required configuration is in place. You can create and process pay periods."
                    : `${requiredDone} of ${requiredTotal} required items complete. Processing is blocked until the required checklist passes.`}
                </p>
                {data.ready && (
                  <Link
                    to="/payroll/periods"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                  >
                    Go to Pay Periods <ArrowRight size={15} />
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* Checklist */}
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-2 flex items-center gap-2">
              <ListChecks size={18} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">Configuration checklist</h3>
            </div>
            <ul>
              {data.checks.map((c) => (
                <CheckRow key={c.key} check={c} />
              ))}
            </ul>
          </section>
        </div>
      )}
    </PayrollLayout>
  );
}
