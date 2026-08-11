// Payroll general settings (spec §1) — the single global row that frames every
// run. GET on mount, PATCH on save. No demo fallback: if the backend can't be
// reached the screen surfaces the error rather than showing invented defaults.

import { useEffect, useState, type FormEvent } from "react";
import { Save } from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  payrollSettingsApi,
  PAYROLL_FREQUENCIES,
  PERIOD_TYPES,
  WORKING_DAYS_SOURCES,
  ROUNDING_MODES,
  type PayrollSettings as Settings,
  type PayrollSettingsPayload,
} from "@/modules/payroll/api/payrollSettingsApi";
import { humanize } from "@/modules/payroll/utils/format";

// Field-level label/help for the toggles so the form explains policy, not just
// exposes booleans. Keeps the spec's intent visible at the point of change.
const TOGGLES: { key: keyof Settings; label: string; help: string }[] = [
  {
    key: "approval_enabled",
    label: "Require approval before locking",
    help: "A processed run must be approved by an Administrator before it can be locked.",
  },
  {
    key: "auto_generate_payslip",
    label: "Auto-generate payslips on process",
    help: "Create payslip records automatically when a period is processed.",
  },
  {
    key: "employee_self_service",
    label: "Employee self-service",
    help: "Let employees view and download their own payslips.",
  },
  {
    key: "payroll_locking_enabled",
    label: "Payroll locking",
    help: "Allow approved periods to be locked so their payslips are frozen.",
  },
  {
    key: "overtime_enabled",
    label: "Overtime pay",
    help: "Off by default — overtime is only paid on non-working days and government holidays.",
  },
];

function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-gray-100 p-4 transition hover:bg-gray-50">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">{help}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-brand" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";
const numberClass = selectClass;

export default function PayrollSettingsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    payrollSettingsApi
      .get()
      .then((data) => active && setSettings(data))
      .catch((err) => {
        if (!active) return;
        setLoadError(err instanceof Error ? err.message : "Couldn't load payroll settings.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const patch = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const payload: PayrollSettingsPayload = {
        frequency: settings.frequency,
        period_type: settings.period_type,
        currency: settings.currency,
        working_days_source: settings.working_days_source,
        fixed_working_days: Number(settings.fixed_working_days),
        working_hours_per_day: Number(settings.working_hours_per_day),
        payslip_close_day: Number(settings.payslip_close_day),
        rounding: settings.rounding,
        approval_enabled: settings.approval_enabled,
        auto_generate_payslip: settings.auto_generate_payslip,
        employee_self_service: settings.employee_self_service,
        payroll_locking_enabled: settings.payroll_locking_enabled,
        overtime_enabled: settings.overtime_enabled,
      };
      const updated = await payrollSettingsApi.update(payload);
      setSettings(updated);
      toast.showSuccess("Payroll settings saved.");
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PayrollLayout activeTab="/payroll/settings">
      <BackendStatusBanner status={status} />

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-gray-100" />
          ))}
        </div>
      ) : loadError || !settings ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-100">
          <p className="text-sm font-medium text-gray-900">Couldn't load payroll settings</p>
          <p className="mt-1 text-sm text-gray-500">{loadError}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Pay Cycle</h2>
            <p className="mt-1 text-sm text-gray-500">How often payroll runs and how periods are framed.</p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Frequency</span>
                <select
                  className={selectClass}
                  value={settings.frequency}
                  onChange={(e) => patch("frequency", e.target.value as Settings["frequency"])}
                >
                  {PAYROLL_FREQUENCIES.map((f) => (
                    <option key={f} value={f}>
                      {humanize(f)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Period Type</span>
                <select
                  className={selectClass}
                  value={settings.period_type}
                  onChange={(e) => patch("period_type", e.target.value as Settings["period_type"])}
                >
                  {PERIOD_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {humanize(p)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Currency</span>
                <input
                  className={numberClass}
                  value={settings.currency}
                  maxLength={8}
                  onChange={(e) => patch("currency", e.target.value.toUpperCase())}
                  placeholder="PKR"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">
                  Payslip Close Day
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={numberClass}
                  value={settings.payslip_close_day}
                  onChange={(e) => patch("payslip_close_day", Number(e.target.value))}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Working Days & Rounding</h2>
            <p className="mt-1 text-sm text-gray-500">
              How working days are counted for pro-rating, and how final amounts round.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">
                  Working Days Source
                </span>
                <select
                  className={selectClass}
                  value={settings.working_days_source}
                  onChange={(e) =>
                    patch("working_days_source", e.target.value as Settings["working_days_source"])
                  }
                >
                  {WORKING_DAYS_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">
                  Fixed Working Days
                </span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={numberClass}
                  value={settings.fixed_working_days}
                  onChange={(e) => patch("fixed_working_days", Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">
                  Working Hours / Day
                </span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  step="0.5"
                  className={numberClass}
                  value={settings.working_hours_per_day}
                  onChange={(e) => patch("working_hours_per_day", Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Rounding</span>
                <select
                  className={selectClass}
                  value={settings.rounding}
                  onChange={(e) => patch("rounding", e.target.value as Settings["rounding"])}
                >
                  {ROUNDING_MODES.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <h2 className="text-base font-semibold text-gray-900">Workflow</h2>
            <p className="mt-1 text-sm text-gray-500">Approval, locking, self-service and overtime policy.</p>
            <div className="mt-5 space-y-3">
              {TOGGLES.map((t) => (
                <Toggle
                  key={t.key}
                  label={t.label}
                  help={t.help}
                  checked={Boolean(settings[t.key])}
                  onChange={(v) => patch(t.key, v as Settings[typeof t.key])}
                />
              ))}
            </div>
          </section>

          <div className="flex justify-end">
            <div className="w-full sm:w-auto sm:min-w-52">
              <PrimaryButton type="submit" loading={saving}>
                <span className="inline-flex items-center gap-2">
                  <Save size={16} /> Save Settings
                </span>
              </PrimaryButton>
            </div>
          </div>
        </form>
      )}
    </PayrollLayout>
  );
}
