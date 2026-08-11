// Activate Payroll — the setup checklist (spec §1 setup gate). Payroll
// processing is HARD-GATED server-side: a period can't be processed until every
// required item passes. This screen mirrors that gate read-only — it reads
// GET /payroll-periods/setup-status and shows each check with a "why it matters"
// detail, so HR knows exactly what's left before the first run.
//
// It is also the shortcut past the whole configuration section: "Set Up Payroll
// Automatically" previews what Quick Setup would create (nothing is written by
// the preview), then creates only the missing pieces in one transaction. Every
// seeded row is an ordinary editable record — settings, three components, a
// company-wide structure, tax slabs, an absence rule — so this is a starting
// point HR can change, not policy baked into the engine. Running it twice
// creates nothing the second time.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ListChecks,
  CheckCircle2,
  Circle,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Wand2,
  Plus,
  MinusCircle,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import Modal from "@/components/dialogs/Modal";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  payrollPeriodsApi,
  type SetupStatus,
  type SetupCheck,
  type QuickSetupPreview,
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

  // Quick Setup. `preview` non-null means the modal is open — the preview call
  // writes nothing, so opening it is always safe.
  const [preview, setPreview] = useState<QuickSetupPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);

  const loadStatus = () =>
    payrollPeriodsApi
      .setupStatus()
      .then(setData)
      .catch(() => toast.showError("Couldn't load the setup checklist."));

  useEffect(() => {
    loadStatus().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await payrollPeriodsApi.quickSetupPreview());
    } catch (err) {
      toast.showError(
        err instanceof Error ? err.message : "Couldn't work out what needs creating.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const runQuickSetup = async () => {
    setRunning(true);
    try {
      const result = await payrollPeriodsApi.quickSetup();
      setPreview(null);
      await loadStatus();
      const created = result.created.length;
      toast.showSuccess(
        created
          ? `Payroll configured — ${created} item${created === 1 ? "" : "s"} created.`
          : "Everything was already set up — nothing changed.",
        "Every item is an ordinary record you can edit from the Configuration tabs.",
      );
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Quick Setup failed.");
    } finally {
      setRunning(false);
    }
  };

  const requiredDone = data ? data.checks.filter((c) => c.required && c.passed).length : 0;
  const requiredTotal = data ? data.checks.filter((c) => c.required).length : 0;
  const toCreate = preview ? preview.items.filter((i) => i.action === "create") : [];
  const toSkip = preview ? preview.items.filter((i) => i.action === "skip") : [];

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

                {/* The shortcut. Offered whether or not the checklist passes —
                    when it already does, Quick Setup only fills the optional
                    gaps and skips the rest, so it stays safe to press. */}
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={openPreview}
                    disabled={previewing}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      data.ready
                        ? "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                        : "bg-gradient-to-r from-brand to-brand-dark text-gray-900 hover:brightness-95"
                    }`}
                  >
                    <Wand2 size={15} />
                    {previewing ? "Checking…" : "Set Up Payroll Automatically"}
                  </button>

                  {data.ready && (
                    <Link
                      to="/payroll/periods"
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
                    >
                      Go to Pay Periods <ArrowRight size={15} />
                    </Link>
                  )}
                </div>

                {!data.ready && (
                  <p className="mt-2 text-xs text-gray-500">
                    Creates sensible defaults for anything missing below — settings,
                    allowances, a company-wide salary structure and tax slabs. You can
                    change every one of them afterwards.
                  </p>
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

      {/* Review before writing. The preview call itself changed nothing, so this
          modal is the only place a decision is made. */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Set Up Payroll Automatically"
        description={
          toCreate.length
            ? `${toCreate.length} item${toCreate.length === 1 ? "" : "s"} will be created. Anything you already configured is left exactly as it is.`
            : "Nothing is missing — your payroll configuration is already complete."
        }
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {toCreate.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Will be created
              </p>
              <ul className="space-y-2">
                {toCreate.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3"
                  >
                    <Plus size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.label}</p>
                      <p className="mt-0.5 text-xs text-gray-600">{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {toSkip.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Already configured — left untouched
              </p>
              <ul className="space-y-1.5">
                {toSkip.map((item) => (
                  <li key={item.key} className="flex items-start gap-2.5 px-1">
                    <MinusCircle size={15} className="mt-0.5 shrink-0 text-gray-300" />
                    <div className="min-w-0">
                      <span className="text-sm text-gray-600">{item.label}</span>
                      <span className="ml-1.5 text-xs text-gray-400">{item.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-600">
            Everything created here is an ordinary, editable record — no policy is
            hard-coded. Rates, slabs and components can all be changed from the
            Configuration tabs, and running this again creates nothing a second time.
          </p>

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PrimaryButton
                type="button"
                onClick={runQuickSetup}
                loading={running}
                disabled={toCreate.length === 0}
              >
                {toCreate.length === 0
                  ? "Nothing to create"
                  : `Create ${toCreate.length} item${toCreate.length === 1 ? "" : "s"}`}
              </PrimaryButton>
            </div>
          </div>
        </div>
      </Modal>
    </PayrollLayout>
  );
}
