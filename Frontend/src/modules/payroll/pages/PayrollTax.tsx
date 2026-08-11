// Tax & Statutory (spec §10) — named, effective-dated, versioned sets of
// progressive slabs (Pakistan FBR salaried style, annualized). HR builds the
// bracket table; the engine annualizes each employee's taxable income, runs it
// through the active config's slabs, and divides by pay periods for the monthly
// tax line. The "Preview tax on ₨X" panel is the tax analogue of the salary
// component "Test Rule" — it runs a sample annual income through a config on the
// server's own tax maths, never a client re-implementation.
//
// Engine list endpoints return a BARE ARRAY — filter + paginate client-side.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Landmark,
  Plus,
  Pencil,
  Trash2,
  Calculator,
  X,
  ArrowRight,
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
  payrollTaxApi,
  type TaxConfig,
  type TaxConfigPayload,
  type TaxSlabPayload,
  type TaxPreview,
} from "@/modules/payroll/api/payrollTaxApi";
import { money } from "@/modules/payroll/utils/format";

// A slab row in the editor keeps its numbers as strings while being typed; the
// blank `upper_bound` means the open-ended top bracket (∞).
type SlabRow = {
  lower_bound: string;
  upper_bound: string;
  base_tax: string;
  rate_percent: string;
};

type FormState = {
  name: string;
  regime: string;
  currency: string;
  is_active: boolean;
  effective_from: string;
  slabs: SlabRow[];
};

const EMPTY_SLAB: SlabRow = { lower_bound: "0", upper_bound: "", base_tax: "0", rate_percent: "0" };

const EMPTY_FORM: FormState = {
  name: "",
  regime: "",
  currency: "PKR",
  is_active: true,
  effective_from: "",
  slabs: [{ ...EMPTY_SLAB }],
};

const inputClass =
  "w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

function slabsFromConfig(cfg: TaxConfig): SlabRow[] {
  const sorted = [...cfg.slabs].sort((a, b) => a.display_order - b.display_order);
  if (sorted.length === 0) return [{ ...EMPTY_SLAB }];
  return sorted.map((s) => ({
    lower_bound: String(s.lower_bound ?? 0),
    upper_bound: s.upper_bound == null ? "" : String(s.upper_bound),
    base_tax: String(s.base_tax ?? 0),
    rate_percent: String(s.rate_percent ?? 0),
  }));
}

export default function PayrollTaxPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<TaxConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TaxConfig | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TaxConfig | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Live preview panel (against the config being edited, once saved, or the
  // active config). Bound to a config id + sample annual income.
  const [previewIncome, setPreviewIncome] = useState("1200000");
  const [previewConfigId, setPreviewConfigId] = useState("");
  const [previewResult, setPreviewResult] = useState<TaxPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    payrollTaxApi
      .list()
      .then((list) => {
        setRows(list);
        if (list.length > 0 && !previewConfigId) setPreviewConfigId(list[0].tax_config_id);
      })
      .catch(() => toast.showError("Couldn't load tax configurations."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => setPage(1), [search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.regime ?? "").toLowerCase().includes(q),
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
    setModalOpen(true);
  };

  const openEdit = (cfg: TaxConfig) => {
    setEditing(cfg);
    setForm({
      name: cfg.name,
      regime: cfg.regime ?? "",
      currency: cfg.currency ?? "PKR",
      is_active: cfg.is_active,
      effective_from: cfg.effective_from ?? "",
      slabs: slabsFromConfig(cfg),
    });
    setFormError(null);
    setModalOpen(true);
  };

  // ---- Slab row editing ----------------------------------------------------
  const setSlab = (idx: number, patch: Partial<SlabRow>) =>
    setForm((f) => ({
      ...f,
      slabs: f.slabs.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));

  const addSlab = () =>
    setForm((f) => {
      // Seed the new bracket's floor from the previous bracket's ceiling.
      const prev = f.slabs[f.slabs.length - 1];
      const lower = prev?.upper_bound || prev?.lower_bound || "0";
      return { ...f, slabs: [...f.slabs, { ...EMPTY_SLAB, lower_bound: lower }] };
    });

  const removeSlab = (idx: number) =>
    setForm((f) => ({
      ...f,
      slabs: f.slabs.length > 1 ? f.slabs.filter((_, i) => i !== idx) : f.slabs,
    }));

  const buildSlabPayload = (): TaxSlabPayload[] =>
    form.slabs.map((s, i) => ({
      lower_bound: Number(s.lower_bound) || 0,
      upper_bound: s.upper_bound.trim() === "" ? null : Number(s.upper_bound),
      base_tax: Number(s.base_tax) || 0,
      rate_percent: Number(s.rate_percent) || 0,
      display_order: i,
    }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("A configuration name is required.");
    if (form.slabs.length === 0) return setFormError("Add at least one tax slab.");

    // Slabs must be contiguous and ascending; exactly one open-ended top slab.
    const slabs = buildSlabPayload();
    for (let i = 0; i < slabs.length; i++) {
      const s = slabs[i];
      if (s.upper_bound != null && s.upper_bound <= s.lower_bound)
        return setFormError(`Slab ${i + 1}: upper bound must exceed the lower bound.`);
      if (s.upper_bound == null && i !== slabs.length - 1)
        return setFormError("Only the last slab may be open-ended (blank upper bound).");
    }

    const payload: TaxConfigPayload = {
      name: form.name.trim(),
      regime: form.regime.trim() || null,
      currency: form.currency.trim() || "PKR",
      is_active: form.is_active,
      effective_from: form.effective_from || null,
      slabs,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await payrollTaxApi.update(editing.tax_config_id, payload);
        toast.showSuccess("Tax configuration updated.");
      } else {
        await payrollTaxApi.create(payload);
        toast.showSuccess("Tax configuration created.");
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
      await payrollTaxApi.remove(deleteTarget.tax_config_id);
      toast.showSuccess("Tax configuration deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete configuration.");
    } finally {
      setDeleting(false);
    }
  };

  const runPreview = async () => {
    const income = Number(previewIncome);
    if (!(income >= 0)) {
      setPreviewError("Enter a valid annual income.");
      return;
    }
    setPreviewing(true);
    setPreviewError(null);
    setPreviewResult(null);
    try {
      const res = await payrollTaxApi.preview({
        annual_taxable: income,
        tax_config_id: previewConfigId || undefined,
      });
      setPreviewResult(res);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  };

  const columns: DataTableColumn<TaxConfig>[] = [
    {
      key: "name",
      label: "Configuration",
      render: (c) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{c.name}</span>
          <span className="block text-xs text-gray-400">
            {c.regime ? `${c.regime} · ` : ""}v{c.version} · {c.slabs.length} slab
            {c.slabs.length === 1 ? "" : "s"}
          </span>
        </div>
      ),
    },
    {
      key: "currency",
      label: "Currency",
      render: (c) => <span className="text-gray-600">{c.currency}</span>,
      align: "center",
      hideBelow: "md",
    },
    {
      key: "status",
      label: "Status",
      render: (c) => <StatusBadge status={c.is_active ? "active" : "inactive"} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab="/payroll/tax">
      <BackendStatusBanner status={status} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Configs table */}
        <div className="lg:col-span-2">
          <DataTable
            columns={columns}
            rows={paged}
            rowKey={(c) => c.tax_config_id}
            loading={loading}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tax configs…"
            emptyIcon={Landmark}
            emptyTitle="No tax configurations yet"
            emptyDescription="Create a progressive slab table — the engine annualizes taxable income and runs it through the active config each run."
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
                <Plus size={16} /> Add Config
              </button>
            }
            actions={(c) => (
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewConfigId(c.tax_config_id);
                    setPreviewResult(null);
                  }}
                  aria-label={`Preview ${c.name}`}
                  className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-brand-dark"
                >
                  <Calculator size={15} />
                </button>
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
        </div>

        {/* Live preview panel */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
            <div className="mb-4 flex items-center gap-2">
              <Calculator size={18} className="text-brand" />
              <h3 className="text-sm font-semibold text-gray-900">Preview tax</h3>
            </div>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">Configuration</span>
              <select
                className={inputClass}
                value={previewConfigId}
                onChange={(e) => {
                  setPreviewConfigId(e.target.value);
                  setPreviewResult(null);
                }}
              >
                <option value="">Active config</option>
                {rows.map((c) => (
                  <option key={c.tax_config_id} value={c.tax_config_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className="mb-1.5 block text-xs font-medium text-gray-500">
                Annual taxable income
              </span>
              <input
                type="number"
                min="0"
                step="1000"
                value={previewIncome}
                onChange={(e) => setPreviewIncome(e.target.value)}
                className={inputClass}
              />
            </label>

            <button
              type="button"
              onClick={runPreview}
              disabled={previewing}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:border-brand/60 hover:text-brand-dark disabled:opacity-50"
            >
              {previewing ? "Computing…" : "Run Preview"} <ArrowRight size={15} />
            </button>

            {previewError && (
              <p className="mt-3 text-sm text-rose-600">{previewError}</p>
            )}

            {previewResult && (
              <div className="mt-4 space-y-2 rounded-xl bg-gray-50 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">Config</span>
                  <span className="text-sm font-medium text-gray-800">
                    {previewResult.config_name}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-400">Annual tax</span>
                  <span className="text-sm font-semibold tabular-nums text-gray-900">
                    {money(previewResult.annual_tax)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-gray-200 pt-2">
                  <span className="text-xs text-gray-400">Monthly tax</span>
                  <span className="text-base font-semibold tabular-nums text-brand-dark">
                    {money(previewResult.monthly_tax)}
                  </span>
                </div>
                {previewResult.slab && (
                  <p className="pt-1 text-xs text-gray-500">
                    Slab: {money(previewResult.slab.lower_bound)} –{" "}
                    {previewResult.slab.upper_bound == null
                      ? "∞"
                      : money(previewResult.slab.upper_bound)}{" "}
                    @ {previewResult.slab.rate_percent}%
                  </p>
                )}
                {previewResult.note && (
                  <p className="pt-1 text-xs leading-relaxed text-gray-500">{previewResult.note}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create / edit config with slab editor */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Tax Configuration" : "Add Tax Configuration"}
        description="Define the progressive brackets. Base tax is the fixed amount up to the slab floor; rate applies to income above it."
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Name"
              placeholder="e.g. FBR Salaried 2026"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <FormField
              label="Regime"
              placeholder="e.g. Salaried"
              value={form.regime}
              onChange={(e) => setForm((f) => ({ ...f, regime: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))}
            />
            <FormField
              label="Effective From"
              type="date"
              value={form.effective_from}
              onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))}
            />
          </div>

          {/* Slab editor */}
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[15px] font-medium text-gray-900">Tax Slabs</span>
              <button
                type="button"
                onClick={addSlab}
                className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-brand/60 hover:text-brand-dark"
              >
                <Plus size={14} /> Add Slab
              </button>
            </div>

            <div className="overflow-hidden rounded-xl ring-1 ring-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-3 py-2 font-semibold">From</th>
                    <th className="px-3 py-2 font-semibold">To (blank = ∞)</th>
                    <th className="px-3 py-2 font-semibold">Base Tax</th>
                    <th className="px-3 py-2 font-semibold">Rate %</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {form.slabs.map((s, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={s.lower_bound}
                          onChange={(e) => setSlab(i, { lower_bound: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          placeholder="∞"
                          value={s.upper_bound}
                          onChange={(e) => setSlab(i, { upper_bound: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          value={s.base_tax}
                          onChange={(e) => setSlab(i, { base_tax: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={s.rate_percent}
                          onChange={(e) => setSlab(i, { rate_percent: e.target.value })}
                          className={inputClass}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeSlab(i)}
                          disabled={form.slabs.length <= 1}
                          aria-label={`Remove slab ${i + 1}`}
                          className="flex min-h-8 min-w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                        >
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <label className="mb-5 flex items-center gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
            />
            Active — the engine uses the active config for the period
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
                {editing ? "Save Changes" : "Create Config"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This cannot be undone. Historical payslips keep their frozen tax snapshot regardless."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PayrollLayout>
  );
}
