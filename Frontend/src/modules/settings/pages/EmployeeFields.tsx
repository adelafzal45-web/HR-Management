// ============================================================================
// Settings → Employee Fields — Required vs Optional toggles (spec Task 1).
//
// A single-row config (id=1) deciding which employee fields must be filled when
// creating or editing an employee. The same map drives the required asterisks
// and client validation on both the HR employee form and the employee's own
// profile-edit screen; the backend enforces it too, so a blank required field
// is rejected even if the form is bypassed.
//
// Only fields that are nullable in the database are configurable here — see
// EMPLOYEE_CONFIGURABLE_FIELDS. Core fields (name, email, department,
// designation, role) are always required and never appear.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import InfoTip from "@/components/common/InfoTip";
import { PrimaryButton } from "@/components/forms/FormField";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { ApiError } from "@/lib/apiClient";
import {
  employeeFieldSettingsApi,
  EMPLOYEE_CONFIGURABLE_FIELDS,
  EMPLOYEE_FIELD_META,
  DEFAULT_EMPLOYEE_FIELD_CONFIG,
  type EmployeeFieldConfig,
  type EmployeeFieldKey,
} from "@/modules/settings/api/employeeFieldSettingsApi";

// Group headings in display order, derived from the shared field list so this
// screen and the employee form can never disagree on which fields exist. `Set`
// preserves first-seen order.
const GROUP_ORDER = Array.from(
  new Set(EMPLOYEE_CONFIGURABLE_FIELDS.map((key) => EMPLOYEE_FIELD_META[key].group)),
);

const sameConfig = (a: EmployeeFieldConfig, b: EmployeeFieldConfig): boolean =>
  EMPLOYEE_CONFIGURABLE_FIELDS.every((key) => a[key] === b[key]);

/** One field's Required/Optional switch. */
function FieldToggle({
  label,
  required,
  onChange,
}: {
  label: string;
  required: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 transition hover:bg-gray-100">
      <span className="text-sm font-medium text-gray-900">{label}</span>
      <span className="flex shrink-0 items-center gap-2.5">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            required ? "bg-emerald-50 text-emerald-700" : "bg-gray-200 text-gray-600"
          }`}
        >
          {required ? "Required" : "Optional"}
        </span>
        <span className="relative inline-flex">
          <input
            type="checkbox"
            role="switch"
            checked={required}
            onChange={(e) => onChange(e.target.checked)}
            className="peer sr-only"
          />
          <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 peer-focus-visible:ring-offset-2" />
          <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
        </span>
      </span>
    </label>
  );
}

export default function EmployeeFieldsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [config, setConfig] = useState<EmployeeFieldConfig>(DEFAULT_EMPLOYEE_FIELD_CONFIG);
  const [baseline, setBaseline] = useState<EmployeeFieldConfig>(DEFAULT_EMPLOYEE_FIELD_CONFIG);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    employeeFieldSettingsApi
      .get()
      .then((res) => {
        setConfig(res.field_config);
        setBaseline(res.field_config);
        setUpdatedAt(res.updated_at);
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Couldn't load the field settings."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => !sameConfig(config, baseline), [config, baseline]);
  const requiredCount = useMemo(
    () => EMPLOYEE_CONFIGURABLE_FIELDS.filter((key) => config[key]).length,
    [config],
  );

  const setField = (key: EmployeeFieldKey, next: boolean) =>
    setConfig((prev) => ({ ...prev, [key]: next }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await employeeFieldSettingsApi.update(config);
      setConfig(res.field_config);
      setBaseline(res.field_config);
      setUpdatedAt(res.updated_at);
      toast.showSuccess("Field settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the field settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsLayout activeTab="/settings/employee-fields">
      <BackendStatusBanner status={status} />

      <p className="mb-4 flex items-start gap-1.5 text-sm text-gray-500">
        <span>
          Choose which employee fields must be filled in when creating or editing an
          employee. Everything not marked Required stays optional.
        </span>
        <InfoTip
          side="bottom"
          label="How required fields work"
          text="A required field must be filled before an employee can be saved — both here in HR and on the employee's own profile page. Core fields (name, email, department, designation, role) are always required and aren't listed. The server enforces the same rules, so a blank required field is rejected even if the form is bypassed."
        />
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-7">
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-6">
                {GROUP_ORDER.map((group) => (
                  <div key={group}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {group}
                    </h3>
                    <div className="space-y-2">
                      {EMPLOYEE_CONFIGURABLE_FIELDS.filter(
                        (key) => EMPLOYEE_FIELD_META[key].group === group,
                      ).map((key) => (
                        <FieldToggle
                          key={key}
                          label={EMPLOYEE_FIELD_META[key].label}
                          required={config[key]}
                          onChange={(next) => setField(key, next)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

              <div className="mt-6 sm:max-w-xs">
                <PrimaryButton
                  type="button"
                  onClick={handleSave}
                  loading={saving}
                  disabled={!dirty}
                >
                  {dirty ? "Save Changes" : "No Changes"}
                </PrimaryButton>
              </div>
            </>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Summary
            </p>
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <ListChecks size={15} className="text-gray-400" />
              {requiredCount} of {EMPLOYEE_CONFIGURABLE_FIELDS.length} fields required
            </p>
            {updatedAt && (
              <p className="mt-2 text-xs text-gray-500">
                Last updated{" "}
                {new Date(updatedAt).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            )}
            <p className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-500">
              Core fields (name, email, department, designation, role) are always required
              and aren't shown here.
            </p>
          </div>
        </div>
      </div>
    </SettingsLayout>
  );
}
