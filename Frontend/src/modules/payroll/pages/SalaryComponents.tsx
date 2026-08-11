// Salary Components (spec §2) — the atom of the payroll engine. HR defines each
// earning/deduction and how its amount is derived: fixed, percent of
// basic/gross, per day/hour, or a formula over APPROVED variables only.
//
// The formula path is deliberately not free-form code: the builder offers the
// whitelisted variable chips (fetched from the backend) and a "Test Rule"
// dry-run that evaluates the expression against sample values on the server's
// safe evaluator — never eval/Function in the browser.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Blocks, Plus, Pencil, Trash2, FlaskConical, Check, X } from "lucide-react";
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
  salaryComponentsApi,
  COMPONENT_TYPES,
  CALCULATION_TYPES,
  type SalaryComponent,
  type SalaryComponentPayload,
  type ComponentType,
  type CalculationType,
  type FormulaVariable,
  type FormulaTestResult,
} from "@/modules/payroll/api/salaryComponentsApi";
import { humanize } from "@/modules/payroll/utils/format";

type FormState = {
  name: string;
  code: string;
  type: ComponentType;
  calculation_type: CalculationType;
  amount: string;
  formula: string;
  is_recurring: boolean;
  is_taxable: boolean;
  include_in_gross: boolean;
  is_active: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  type: "earning",
  calculation_type: "fixed",
  amount: "0",
  formula: "",
  is_recurring: true,
  is_taxable: false,
  include_in_gross: true,
  is_active: true,
};

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

// Which calc types need an amount vs a formula. `fixed` reads a flat amount,
// the percent/per-unit types read amount as their rate, `formula` reads the
// expression. Drives which inputs the modal shows.
const AMOUNT_LABEL: Partial<Record<CalculationType, string>> = {
  fixed: "Amount",
  percent_basic: "Percent of Basic (%)",
  percent_gross: "Percent of Gross (%)",
  per_day: "Rate per Day",
  per_hour: "Rate per Hour",
};

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
      />
      {label}
    </label>
  );
}

export default function SalaryComponentsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<SalaryComponent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [variables, setVariables] = useState<FormulaVariable[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryComponent | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Formula test panel state (only relevant when calculation_type === "formula")
  const [testResult, setTestResult] = useState<FormulaTestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SalaryComponent | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Engine list endpoints return a BARE ARRAY (no {data,total} wrapper), so we
  // filter + paginate client-side and derive total from the filtered length.
  const load = () => {
    setLoading(true);
    salaryComponentsApi
      .list()
      .then(setRows)
      .catch(() => toast.showError("Couldn't load salary components."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    salaryComponentsApi.variables().then(setVariables).catch(() => setVariables([]));
  }, []);

  useEffect(() => setPage(1), [search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  useEffect(() => setTotal(filtered.length), [filtered]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setTestResult(null);
    setModalOpen(true);
  };

  const openEdit = (c: SalaryComponent) => {
    setEditing(c);
    setForm({
      name: c.name,
      code: c.code,
      type: c.type,
      calculation_type: c.calculation_type,
      amount: String(c.amount ?? 0),
      formula: c.formula ?? "",
      is_recurring: c.is_recurring,
      is_taxable: c.is_taxable,
      include_in_gross: c.include_in_gross,
      is_active: c.is_active,
    });
    setFormError(null);
    setTestResult(null);
    setModalOpen(true);
  };

  const insertVariable = (name: string) =>
    setForm((f) => ({ ...f, formula: `${f.formula}${f.formula && !f.formula.endsWith(" ") ? " " : ""}${name}` }));

  const runTest = async () => {
    if (!form.formula.trim()) {
      setTestResult({ ok: false, result: null, error: "Enter a formula to test.", scope: {} });
      return;
    }
    setTesting(true);
    try {
      const res = await salaryComponentsApi.testFormula({ formula: form.formula });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        result: null,
        error: err instanceof Error ? err.message : "Test failed.",
        scope: {},
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("Component name is required.");
    if (!form.code.trim()) return setFormError("Component code is required.");
    if (form.calculation_type === "formula" && !form.formula.trim())
      return setFormError("A formula is required for the formula calculation type.");

    const payload: SalaryComponentPayload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      type: form.type,
      calculation_type: form.calculation_type,
      amount: form.calculation_type === "formula" ? 0 : Number(form.amount) || 0,
      formula: form.calculation_type === "formula" ? form.formula.trim() : null,
      is_recurring: form.is_recurring,
      is_taxable: form.is_taxable,
      include_in_gross: form.include_in_gross,
      is_active: form.is_active,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await salaryComponentsApi.update(editing.component_id, payload);
        toast.showSuccess("Component updated.");
      } else {
        await salaryComponentsApi.create(payload);
        toast.showSuccess("Component created.");
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
      await salaryComponentsApi.remove(deleteTarget.component_id);
      toast.showSuccess("Component deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete component.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<SalaryComponent>[] = [
    {
      key: "name",
      label: "Component",
      render: (c) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{c.name}</span>
          <span className="block font-mono text-xs text-gray-400">{c.code}</span>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (c) => (
        <span className={c.type === "deduction" ? "text-rose-600" : "text-emerald-700"}>
          {humanize(c.type)}
        </span>
      ),
    },
    {
      key: "calculation_type",
      label: "Calculation",
      render: (c) => (
        <span className="text-gray-600">
          {humanize(c.calculation_type)}
          {c.calculation_type === "formula" && c.formula ? (
            <span className="ml-1 font-mono text-xs text-gray-400">= {c.formula}</span>
          ) : null}
        </span>
      ),
      hideBelow: "md",
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge status={c.is_active ? "active" : "inactive"} />,
      align: "center",
    },
  ];

  const showFormula = form.calculation_type === "formula";
  const amountLabel = AMOUNT_LABEL[form.calculation_type];

  return (
    <PayrollLayout activeTab="/payroll/components">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(c) => c.component_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search components…"
        emptyIcon={Blocks}
        emptyTitle="No salary components yet"
        emptyDescription="Define earnings and deductions — Basic, House Rent, Tax, Provident Fund — that structures are built from."
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
            <Plus size={16} /> Add Component
          </button>
        }
        actions={(c) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(c)}
              aria-label={`Edit ${c.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(c)}
              aria-label={`Delete ${c.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Component" : "Add Component"}
        description={
          editing ? "Update this earning or deduction." : "Create a new earning or deduction."
        }
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Name"
              placeholder="e.g. House Rent Allowance"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <FormField
              label="Code"
              placeholder="e.g. HRA"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">Type</span>
              <select
                className={selectClass}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ComponentType }))}
              >
                {COMPONENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">Calculation</span>
              <select
                className={selectClass}
                value={form.calculation_type}
                onChange={(e) => {
                  setForm((f) => ({ ...f, calculation_type: e.target.value as CalculationType }));
                  setTestResult(null);
                }}
              >
                {CALCULATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {amountLabel && (
            <FormField
              label={amountLabel}
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          )}

          {showFormula && (
            <div className="mb-5">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">Formula</span>
              <textarea
                value={form.formula}
                onChange={(e) => {
                  setForm((f) => ({ ...f, formula: e.target.value }));
                  setTestResult(null);
                }}
                placeholder="e.g. BASIC * 0.1 + OT_AMOUNT"
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
                        onClick={() => insertVariable(v.name)}
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
                  <FlaskConical size={15} />
                  {testing ? "Testing…" : "Test Rule"}
                </button>
                {testResult && (
                  <span
                    className={`flex items-center gap-1.5 text-sm font-medium ${
                      testResult.ok ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {testResult.ok ? <Check size={15} /> : <X size={15} />}
                    {testResult.ok ? `Result: ${testResult.result}` : testResult.error}
                  </span>
                )}
              </div>
              {testResult?.ok && Object.keys(testResult.scope).length > 0 && (
                <p className="mt-2 font-mono text-xs text-gray-400">
                  Sample: {Object.entries(testResult.scope).map(([k, v]) => `${k}=${v}`).join(", ")}
                </p>
              )}
            </div>
          )}

          <div className="mb-5 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-4">
            <CheckboxRow
              checked={form.is_recurring}
              onChange={(v) => setForm((f) => ({ ...f, is_recurring: v }))}
              label="Recurring"
            />
            <CheckboxRow
              checked={form.include_in_gross}
              onChange={(v) => setForm((f) => ({ ...f, include_in_gross: v }))}
              label="Include in gross"
            />
            <CheckboxRow
              checked={form.is_taxable}
              onChange={(v) => setForm((f) => ({ ...f, is_taxable: v }))}
              label="Taxable"
            />
            <CheckboxRow
              checked={form.is_active}
              onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              label="Active"
            />
          </div>

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
                {editing ? "Save Changes" : "Create Component"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Structures referencing this component may be affected."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PayrollLayout>
  );
}
