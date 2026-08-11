// Shared engine for the Rule Builder (spec §4–8, §16). Both the full Rule
// Builder (/payroll/rules) and the Bonuses wrapper (/payroll/bonuses) render
// this — the latter passes `lockedRuleType="bonus"` so it's the same builder
// narrowed to one kind. Not a routed page itself.
//
// A single versioned table backs every rule kind, discriminated by `rule_type`
// with type-specific settings in `config`. The form's fields switch on the
// selected type; every formula field routes through the SAME safe-evaluator
// palette + "Test Rule" dry-run as salary components (never eval in the browser).
// Editing an active rule stores a new version server-side and supersedes the
// old one — the Versions drawer walks that chain.

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Scale,
  Plus,
  Pencil,
  Trash2,
  History,
  FlaskConical,
  Check,
  X,
} from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
  payrollRulesApi,
  ACTIVE_RULE_TYPES,
  OVERTIME_APPLIES_TO,
  SCOPE_TYPES,
  type PayrollRule,
  type PayrollRulePayload,
  type RuleType,
  type RuleConfig,
  type ScopeType,
  type OvertimeAppliesTo,
} from "@/modules/payroll/api/payrollRulesApi";
import {
  salaryComponentsApi,
  type FormulaVariable,
  type FormulaTestResult,
} from "@/modules/payroll/api/salaryComponentsApi";
import { lookupsApi } from "@/modules/employees/api/lookupsApi";
import { employeesApi, type Employee } from "@/modules/employees/api/employeeApi";
import { shortDate, humanize } from "@/modules/payroll/utils/format";

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

// A scope option: the id we send and the label we show, per scope_type.
type ScopeOption = { id: string; label: string };

// Sensible starting config for each rule kind (overtime OFF by default per spec).
function defaultConfig(t: RuleType): RuleConfig {
  switch (t) {
    case "absent":
      return { mode: "per_day", multiplier: 1 };
    case "late":
      return { grace_minutes: 0, unit: "per_incident", amount: 0 };
    case "repeated_late":
      return { threshold_count: 3, penalty_days: 1 };
    case "leave":
      return { unpaid_leave_deduction: "per_day", multiplier: 1 };
    case "overtime":
      return { enabled: false, applies_to: ["non_working_day", "govt_holiday"], rate_multiplier: 1 };
    case "bonus":
      return { trigger: "flat", amount: 0, taxable: true };
    default:
      return {};
  }
}

type FormState = {
  rule_type: RuleType;
  name: string;
  scope_type: ScopeType;
  scope_id: string;
  priority: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string;
  config: RuleConfig;
};

function emptyForm(ruleType: RuleType): FormState {
  return {
    rule_type: ruleType,
    name: "",
    scope_type: "company",
    scope_id: "",
    priority: "0",
    is_active: true,
    effective_from: "",
    effective_to: "",
    config: defaultConfig(ruleType),
  };
}

// A reusable formula field: textarea + approved-variable chips + server-side
// "Test Rule" dry-run. Each instance tests its own expression independently.
function FormulaField({
  value,
  onChange,
  variables,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  variables: FormulaVariable[];
  placeholder?: string;
}) {
  const [result, setResult] = useState<FormulaTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const insert = (name: string) =>
    onChange(`${value}${value && !value.endsWith(" ") ? " " : ""}${name}`);

  const runTest = async () => {
    if (!value.trim()) {
      setResult({ ok: false, result: null, error: "Enter a formula to test.", scope: {} });
      return;
    }
    setTesting(true);
    try {
      setResult(await salaryComponentsApi.testFormula({ formula: value }));
    } catch (err) {
      setResult({
        ok: false,
        result: null,
        error: err instanceof Error ? err.message : "Test failed.",
        scope: {},
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mb-5">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">Formula</span>
      <textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setResult(null);
        }}
        placeholder={placeholder ?? "e.g. BASIC / WORKING_DAYS * ABSENT_DAYS"}
        rows={2}
        className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 font-mono text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
      />
      {variables.length > 0 && (
        <div className="mt-2.5">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Approved variables — click to insert
          </span>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((v) => (
              <button
                key={v.name}
                type="button"
                onClick={() => insert(v.name)}
                title={v.description}
                className="rounded-full bg-brand-light px-2.5 py-1 font-mono text-xs font-semibold text-brand-dark transition hover:brightness-95"
              >
                {v.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={runTest}
          disabled={testing}
          className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
        >
          <FlaskConical size={15} /> {testing ? "Testing…" : "Test Rule"}
        </button>
        {result && (
          <span
            className={`flex items-center gap-1.5 text-sm font-medium ${
              result.ok ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {result.ok ? <Check size={15} /> : <X size={15} />}
            {result.ok ? `Result: ${result.result}` : result.error}
          </span>
        )}
      </div>
    </div>
  );
}

// A labelled field wrapper matching the modal's spacing.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">{label}</span>
      {children}
    </label>
  );
}

export default function RulesManager({
  activeTab,
  lockedRuleType,
}: {
  activeTab: string;
  /** When set, the builder is narrowed to this one kind (the Bonuses wrapper). */
  lockedRuleType?: RuleType;
}) {
  const status = useBackendStatus();
  const toast = useToast();

  const availableTypes = useMemo<readonly RuleType[]>(
    () => (lockedRuleType ? [lockedRuleType] : ACTIVE_RULE_TYPES),
    [lockedRuleType],
  );

  const [rows, setRows] = useState<PayrollRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [variables, setVariables] = useState<FormulaVariable[]>([]);

  // Scope option lists, loaded once and keyed by scope_type.
  const [scopeOptions, setScopeOptions] = useState<Record<ScopeType, ScopeOption[]>>({
    company: [],
    job_category: [],
    department: [],
    designation: [],
    employee: [],
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollRule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(availableTypes[0]));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PayrollRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [versionsFor, setVersionsFor] = useState<PayrollRule | null>(null);
  const [versions, setVersions] = useState<PayrollRule[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  const load = () => {
    setLoading(true);
    const params = lockedRuleType ? { rule_type: lockedRuleType } : {};
    payrollRulesApi
      .list(params)
      .then(setRows)
      .catch(() => toast.showError("Couldn't load rules."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    salaryComponentsApi.variables().then(setVariables).catch(() => setVariables([]));
    Promise.all([
      lookupsApi.jobCategories().catch(() => []),
      lookupsApi.departments().catch(() => []),
      lookupsApi.designations().catch(() => []),
      employeesApi.list({ status: "active", pageSize: 500 }).then((r) => r.data).catch(() => [] as Employee[]),
    ]).then(([jc, dep, des, emp]) => {
      setScopeOptions({
        company: [],
        job_category: jc.map((x) => ({ id: x.job_category_id, label: x.job_category_name })),
        department: dep.map((x) => ({ id: x.department_id, label: x.department_name })),
        designation: des.map((x) => ({ id: x.designation_id, label: x.title })),
        employee: emp.map((e) => ({
          id: e.employeeId,
          label: `${e.firstName} ${e.lastName}`.trim() + (e.employeeCode ? ` — ${e.employeeCode}` : ""),
        })),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedRuleType]);

  useEffect(() => setPage(1), [search, pageSize]);

  const scopeLabel = (r: PayrollRule): string => {
    if (r.scope_type === "company") return "Company-wide";
    const opt = scopeOptions[r.scope_type]?.find((o) => o.id === r.scope_id);
    return `${humanize(r.scope_type)}: ${opt?.label ?? "—"}`;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.rule_type.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => setTotal(filtered.length), [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(availableTypes[0]));
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (r: PayrollRule) => {
    setEditing(r);
    setForm({
      rule_type: r.rule_type,
      name: r.name,
      scope_type: r.scope_type,
      scope_id: r.scope_id ?? "",
      priority: String(r.priority ?? 0),
      is_active: r.is_active,
      effective_from: r.effective_from ?? "",
      effective_to: r.effective_to ?? "",
      config: { ...defaultConfig(r.rule_type), ...(r.config ?? {}) },
    });
    setFormError(null);
    setModalOpen(true);
  };

  const setConfig = (patch: RuleConfig) =>
    setForm((f) => ({ ...f, config: { ...f.config, ...patch } }));

  const changeRuleType = (t: RuleType) =>
    setForm((f) => ({ ...f, rule_type: t, config: defaultConfig(t) }));

  const openVersions = async (r: PayrollRule) => {
    setVersionsFor(r);
    setVersions([]);
    setLoadingVersions(true);
    try {
      setVersions(await payrollRulesApi.versions(r.rule_id));
    } catch {
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("A rule name is required.");
    if (form.scope_type !== "company" && !form.scope_id)
      return setFormError(`Select a ${humanize(form.scope_type).toLowerCase()} for this scope.`);

    const payload: PayrollRulePayload = {
      rule_type: form.rule_type,
      name: form.name.trim(),
      scope_type: form.scope_type,
      scope_id: form.scope_type === "company" ? null : form.scope_id,
      priority: Number(form.priority) || 0,
      is_active: form.is_active,
      effective_from: form.effective_from || null,
      effective_to: form.effective_to || null,
      config: form.config,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await payrollRulesApi.update(editing.rule_id, payload);
        toast.showSuccess("Rule updated — a new version was recorded.");
      } else {
        await payrollRulesApi.create(payload);
        toast.showSuccess("Rule created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await payrollRulesApi.remove(deleteTarget.rule_id);
      toast.showSuccess("Rule deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete rule.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<PayrollRule>[] = [
    {
      key: "name",
      label: "Rule",
      render: (r) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{r.name}</span>
          <span className="block text-xs text-gray-400">
            {humanize(r.rule_type)} · v{r.version}
          </span>
        </div>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      render: (r) => <span className="text-gray-600">{scopeLabel(r)}</span>,
      hideBelow: "md",
    },
    {
      key: "priority",
      label: "Priority",
      render: (r) => <span className="text-gray-600 tabular-nums">{r.priority}</span>,
      align: "center",
      hideBelow: "lg",
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.is_active ? "active" : "inactive"} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab={activeTab}>
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(r) => r.rule_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search rules…"
        emptyIcon={Scale}
        emptyTitle={lockedRuleType ? "No bonus rules yet" : "No rules yet"}
        emptyDescription={
          lockedRuleType
            ? "Define a bonus or incentive — flat, a percent of gross, or a formula over approved variables."
            : "Build attendance, late, leave, overtime and bonus rules. Overtime defaults OFF — only non-working days and government holidays count when enabled."
        }
        page={page}
        pageSize={pageSize}
        onPageSizeChange={setPageSize}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        toolbarRight={
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} /> {lockedRuleType ? "Add Bonus" : "Add Rule"}
          </button>
        }
        actions={(r) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openVersions(r)}
              aria-label={`Versions of ${r.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-brand-dark"
            >
              <History size={15} />
            </button>
            <button
              type="button"
              onClick={() => openEdit(r)}
              aria-label={`Edit ${r.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(r)}
              aria-label={`Delete ${r.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      {/* Create / edit */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Rule" : lockedRuleType ? "Add Bonus" : "Add Rule"}
        description={
          editing
            ? "Saving records a new version and supersedes the current one."
            : "Configure how this rule affects payroll. Fields change with the rule type."
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit}>
          {!lockedRuleType && (
            <Field label="Rule Type">
              <select
                className={selectClass}
                value={form.rule_type}
                disabled={!!editing}
                onChange={(e) => changeRuleType(e.target.value as RuleType)}
              >
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <FormField
            label="Name"
            placeholder={lockedRuleType ? "e.g. Eid Bonus" : "e.g. Standard Absent Deduction"}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          {/* Scope + priority */}
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <Field label="Scope">
              <select
                className={selectClass}
                value={form.scope_type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scope_type: e.target.value as ScopeType, scope_id: "" }))
                }
              >
                {SCOPE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className={selectClass}
              />
            </Field>
          </div>

          {form.scope_type !== "company" && (
            <Field label={humanize(form.scope_type)}>
              <select
                className={selectClass}
                value={form.scope_id}
                onChange={(e) => setForm((f) => ({ ...f, scope_id: e.target.value }))}
              >
                <option value="">{`Select a ${humanize(form.scope_type).toLowerCase()}…`}</option>
                {(scopeOptions[form.scope_type] ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* Type-specific config */}
          <div className="mb-5 rounded-xl bg-gray-50 p-4">
            <span className="mb-3 block text-xs font-semibold uppercase tracking-wide text-gray-400">
              {humanize(form.rule_type)} settings
            </span>
            <RuleConfigFields
              ruleType={form.rule_type}
              config={form.config}
              setConfig={setConfig}
              variables={variables}
            />
          </div>

          {/* Effective window */}
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Effective From"
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
            />
            <FormField
              label="Effective To"
              type="date"
              value={form.effective_to}
              onChange={(e) => setForm((f) => ({ ...f, effective_to: e.target.value }))}
            />
          </div>

          <label className="mb-5 flex items-center gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
            />
            Active
          </label>

          {formError && <p className="mb-4 text-sm text-red-500">{formError}</p>}

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex-1">
              <PrimaryButton type="submit" loading={saving}>
                {editing ? "Save New Version" : "Create Rule"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      {/* Versions drawer */}
      <Modal
        open={!!versionsFor}
        onClose={() => setVersionsFor(null)}
        title={versionsFor ? `Versions — ${versionsFor.name}` : "Versions"}
        description="Every edit is a new version; historical payslips keep the version they were computed with."
        maxWidth="max-w-xl"
      >
        {loadingVersions ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100" />
            ))}
          </div>
        ) : versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">No version history.</p>
        ) : (
          <ol className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.rule_id}
                className={`flex items-center justify-between rounded-xl px-4 py-3 ring-1 ${
                  v.is_active && !v.superseded_by
                    ? "bg-brand-light/40 ring-brand/30"
                    : "bg-gray-50 ring-gray-100"
                }`}
              >
                <div className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    Version {v.version}
                    {v.is_active && !v.superseded_by ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Current
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Superseded
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-400">
                    {shortDate(v.effective_from)} – {shortDate(v.effective_to)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This deactivates the rule. Historical payslips are unaffected — they keep their frozen snapshot."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PayrollLayout>
  );
}

// The heart of the builder: the fields that switch on rule_type. Kept as a pure
// component driven by (config, setConfig) so the parent owns all state.
function RuleConfigFields({
  ruleType,
  config,
  setConfig,
  variables,
}: {
  ruleType: RuleType;
  config: RuleConfig;
  setConfig: (patch: RuleConfig) => void;
  variables: FormulaVariable[];
}) {
  const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : fallback);
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);

  if (ruleType === "absent") {
    const mode = str(config.mode, "per_day");
    return (
      <>
        <Field label="Deduction Mode">
          <select
            className={selectClass}
            value={mode}
            onChange={(e) => setConfig({ mode: e.target.value })}
          >
            <option value="per_day">Per absent day (BASIC / WORKING_DAYS × multiplier)</option>
            <option value="formula">Formula</option>
          </select>
        </Field>
        {mode === "per_day" ? (
          <Field label="Multiplier">
            <input
              type="number"
              step="0.1"
              value={String(num(config.multiplier, 1))}
              onChange={(e) => setConfig({ multiplier: Number(e.target.value) })}
              className={selectClass}
            />
          </Field>
        ) : (
          <FormulaField
            value={str(config.formula)}
            onChange={(v) => setConfig({ formula: v })}
            variables={variables}
          />
        )}
      </>
    );
  }

  if (ruleType === "late") {
    const unit = str(config.unit, "per_incident");
    return (
      <>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Field label="Grace Minutes">
            <input
              type="number"
              value={String(num(config.grace_minutes, 0))}
              onChange={(e) => setConfig({ grace_minutes: Number(e.target.value) })}
              className={selectClass}
            />
          </Field>
          <Field label="Penalty Unit">
            <select
              className={selectClass}
              value={unit}
              onChange={(e) => setConfig({ unit: e.target.value })}
            >
              <option value="per_incident">Per incident</option>
              <option value="per_minute">Per late minute</option>
              <option value="half_day">Half day</option>
            </select>
          </Field>
        </div>
        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            value={String(num(config.amount, 0))}
            onChange={(e) => setConfig({ amount: Number(e.target.value) })}
            className={selectClass}
          />
        </Field>
        <FormulaField
          value={str(config.formula)}
          onChange={(v) => setConfig({ formula: v })}
          variables={variables}
          placeholder="Optional — overrides the amount when set, e.g. LATE_MINUTES * 10"
        />
      </>
    );
  }

  if (ruleType === "repeated_late") {
    return (
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        <Field label="Threshold (incidents)">
          <input
            type="number"
            value={String(num(config.threshold_count, 3))}
            onChange={(e) => setConfig({ threshold_count: Number(e.target.value) })}
            className={selectClass}
          />
        </Field>
        <Field label="Penalty (days)">
          <input
            type="number"
            step="0.5"
            value={String(num(config.penalty_days, 1))}
            onChange={(e) => setConfig({ penalty_days: Number(e.target.value) })}
            className={selectClass}
          />
        </Field>
      </div>
    );
  }

  if (ruleType === "leave") {
    const mode = str(config.unpaid_leave_deduction, "per_day");
    return (
      <>
        <Field label="Unpaid Leave Deduction">
          <select
            className={selectClass}
            value={mode}
            onChange={(e) => setConfig({ unpaid_leave_deduction: e.target.value })}
          >
            <option value="per_day">Per day (BASIC / WORKING_DAYS × multiplier)</option>
            <option value="none">None</option>
          </select>
        </Field>
        {mode === "per_day" && (
          <Field label="Multiplier">
            <input
              type="number"
              step="0.1"
              value={String(num(config.multiplier, 1))}
              onChange={(e) => setConfig({ multiplier: Number(e.target.value) })}
              className={selectClass}
            />
          </Field>
        )}
      </>
    );
  }

  if (ruleType === "overtime") {
    const enabled = config.enabled === true;
    const appliesTo = Array.isArray(config.applies_to)
      ? (config.applies_to as OvertimeAppliesTo[])
      : [];
    const toggleApplies = (v: OvertimeAppliesTo) =>
      setConfig({
        applies_to: appliesTo.includes(v)
          ? appliesTo.filter((x) => x !== v)
          : [...appliesTo, v],
      });
    return (
      <>
        <label className="mb-4 flex items-center gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setConfig({ enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
          />
          Enable overtime (off by default — only non-working days &amp; government holidays)
        </label>
        {enabled && (
          <>
            <div className="mb-4">
              <span className="mb-2 block text-sm font-medium text-gray-700">Applies to</span>
              <div className="flex flex-wrap gap-3">
                {OVERTIME_APPLIES_TO.map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={appliesTo.includes(v)}
                      onChange={() => toggleApplies(v)}
                      className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
                    />
                    {humanize(v)}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field label="Rate Multiplier">
                <input
                  type="number"
                  step="0.1"
                  value={String(num(config.rate_multiplier, 1))}
                  onChange={(e) => setConfig({ rate_multiplier: Number(e.target.value) })}
                  className={selectClass}
                />
              </Field>
              <Field label="Cap Hours (optional)">
                <input
                  type="number"
                  value={config.cap_hours == null ? "" : String(num(config.cap_hours))}
                  onChange={(e) =>
                    setConfig({ cap_hours: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className={selectClass}
                />
              </Field>
            </div>
            <FormulaField
              value={str(config.formula)}
              onChange={(v) => setConfig({ formula: v })}
              variables={variables}
              placeholder="Optional — overrides the rate maths, e.g. OT_HOURS * HOURLY_RATE * 1.5"
            />
          </>
        )}
      </>
    );
  }

  if (ruleType === "bonus") {
    const trigger = str(config.trigger, "flat");
    return (
      <>
        <Field label="Trigger">
          <select
            className={selectClass}
            value={trigger}
            onChange={(e) => setConfig({ trigger: e.target.value })}
          >
            <option value="flat">Flat amount</option>
            <option value="percent_gross">Percent of gross</option>
            <option value="formula">Formula</option>
          </select>
        </Field>
        {trigger === "formula" ? (
          <FormulaField
            value={str(config.formula)}
            onChange={(v) => setConfig({ formula: v })}
            variables={variables}
            placeholder="e.g. GROSS * 0.1"
          />
        ) : (
          <Field label={trigger === "percent_gross" ? "Percent of Gross (%)" : "Amount"}>
            <input
              type="number"
              step="0.01"
              value={String(num(config.amount, 0))}
              onChange={(e) => setConfig({ amount: Number(e.target.value) })}
              className={selectClass}
            />
          </Field>
        )}
        <label className="flex items-center gap-2.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={config.taxable !== false}
            onChange={(e) => setConfig({ taxable: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
          />
          Taxable — counts toward taxable income
        </label>
      </>
    );
  }

  return null;
}
