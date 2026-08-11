// Pay Periods (spec §1) — the run register and its state machine. A period is
// the unit HR processes: it moves draft → processing → pending_approval →
// approved → locked → paid. HR creates and processes; an Administrator approves;
// either locks. The action a row offers is driven strictly by its current
// status so the workflow can't be short-circuited from the UI.
//
// Like every engine list endpoint, payrollPeriodsApi.list() returns a BARE
// ARRAY — we filter + paginate client-side and derive total from the filtered
// length.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, Plus, Pencil, Trash2, PlayCircle, CheckCircle2, Lock } from "lucide-react";
import PayrollLayout from "./PayrollLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import StatusBadge from "@/components/common/StatusBadge";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";
import {
  payrollPeriodsApi,
  type PayrollPeriod,
  type PayrollPeriodPayload,
} from "@/modules/payroll/api/payrollPeriodsApi";
import {
  PAYROLL_FREQUENCIES,
  type PayrollFrequency,
} from "@/modules/payroll/api/payrollSettingsApi";
import { shortDate } from "@/modules/payroll/utils/format";

type FormState = {
  name: string;
  frequency: PayrollFrequency;
  period_start: string;
  period_end: string;
  pay_date: string;
  working_days: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  frequency: "monthly",
  period_start: "",
  period_end: "",
  pay_date: "",
  working_days: "",
  notes: "",
};

const selectClass =
  "w-full rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60";

// A period can only be edited/deleted while still a draft — once it's been
// processed its payslips exist and the row is part of the audit trail.
const isDraft = (p: PayrollPeriod) => p.status === "draft";

export default function PayrollPeriodsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  // Approval is Administrator-only (payroll.approve). Everything else is granted
  // to both HR Admin and Administrator, so we gate only the approve action.
  const canApprove = hasPermission("payroll.approve");

  const [rows, setRows] = useState<PayrollPeriod[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollPeriod | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PayrollPeriod | null>(null);
  const [deleting, setDeleting] = useState(false);

  // The status-transition action currently running, keyed by period id, so we
  // can disable just that row's buttons and show inline progress.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    payrollPeriodsApi
      .list()
      .then(setRows)
      .catch(() => toast.showError("Couldn't load pay periods."))
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
      (r) => r.name.toLowerCase().includes(q) || r.status.toLowerCase().includes(q),
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

  const openEdit = (p: PayrollPeriod) => {
    setEditing(p);
    setForm({
      name: p.name,
      frequency: p.frequency,
      period_start: p.period_start ?? "",
      period_end: p.period_end ?? "",
      pay_date: p.pay_date ?? "",
      working_days: p.working_days != null ? String(p.working_days) : "",
      notes: p.notes ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("Period name is required.");
    if (!form.period_start) return setFormError("Start date is required.");
    if (!form.period_end) return setFormError("End date is required.");
    if (form.period_end < form.period_start)
      return setFormError("End date can't be before the start date.");

    const payload: PayrollPeriodPayload = {
      name: form.name.trim(),
      frequency: form.frequency,
      period_start: form.period_start,
      period_end: form.period_end,
      pay_date: form.pay_date || undefined,
      working_days: form.working_days ? Number(form.working_days) : undefined,
      notes: form.notes.trim() || undefined,
    };

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await payrollPeriodsApi.update(editing.period_id, payload);
        toast.showSuccess("Pay period updated.");
      } else {
        await payrollPeriodsApi.create(payload);
        toast.showSuccess("Pay period created.");
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
      await payrollPeriodsApi.remove(deleteTarget.period_id);
      toast.showSuccess("Pay period deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete pay period.");
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async (p: PayrollPeriod) => {
    setBusyId(p.period_id);
    try {
      await payrollPeriodsApi.approve(p.period_id);
      toast.showSuccess(`${p.name} approved.`);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't approve period.");
    } finally {
      setBusyId(null);
    }
  };

  const handleLock = async (p: PayrollPeriod) => {
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

  const columns: DataTableColumn<PayrollPeriod>[] = [
    {
      key: "name",
      label: "Period",
      render: (p) => (
        <div className="min-w-0">
          <span className="block font-medium text-gray-900">{p.name}</span>
          <span className="block text-xs text-gray-400">
            {shortDate(p.period_start)} – {shortDate(p.period_end)}
          </span>
        </div>
      ),
    },
    {
      key: "pay_date",
      label: "Pay Date",
      render: (p) => <span className="text-gray-600">{shortDate(p.pay_date)}</span>,
      hideBelow: "md",
    },
    {
      key: "working_days",
      label: "Working Days",
      render: (p) => <span className="text-gray-600">{p.working_days ?? "—"}</span>,
      align: "center",
      hideBelow: "lg",
    },
    {
      key: "status",
      label: "Status",
      render: (p) => <StatusBadge status={p.status} />,
      align: "center",
    },
  ];

  return (
    <PayrollLayout activeTab="/payroll/periods">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={paged}
        rowKey={(p) => p.period_id}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search periods…"
        emptyIcon={CalendarRange}
        emptyTitle="No pay periods yet"
        emptyDescription="Create a pay period, then process it to generate payslips for that cycle."
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
            <Plus size={16} /> New Period
          </button>
        }
        actions={(p) => {
          const busy = busyId === p.period_id;
          return (
            <div className="flex items-center justify-end gap-1.5">
              {/* Process — available while draft. Routes into the run screen
                  scoped to this period rather than processing inline. */}
              {isDraft(p) && (
                <button
                  type="button"
                  onClick={() => navigate(`/payroll/run?period=${p.period_id}`)}
                  className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-brand-dark transition hover:bg-brand-light"
                >
                  <PlayCircle size={15} /> Process
                </button>
              )}

              {/* Approve — Administrator only, once the run is pending approval. */}
              {p.status === "pending_approval" && canApprove && (
                <button
                  type="button"
                  onClick={() => handleApprove(p)}
                  disabled={busy}
                  className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50"
                >
                  <CheckCircle2 size={15} /> {busy ? "Approving…" : "Approve"}
                </button>
              )}

              {/* Lock — freezes an approved run's payslips. */}
              {p.status === "approved" && (
                <button
                  type="button"
                  onClick={() => handleLock(p)}
                  disabled={busy}
                  className="flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 disabled:opacity-50"
                >
                  <Lock size={15} /> {busy ? "Locking…" : "Lock"}
                </button>
              )}

              {isDraft(p) && (
                <>
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    aria-label={`Edit ${p.name}`}
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(p)}
                    aria-label={`Delete ${p.name}`}
                    className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          );
        }}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Pay Period" : "New Pay Period"}
        description={
          editing
            ? "Update the dates and details of this draft period."
            : "Define the cycle you'll process payslips for."
        }
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit}>
          <FormField
            label="Name"
            placeholder="e.g. August 2026"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Frequency</span>
            <select
              className={selectClass}
              value={form.frequency}
              onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as PayrollFrequency }))}
            >
              {PAYROLL_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Start Date"
              type="date"
              value={form.period_start}
              onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
              required
            />
            <FormField
              label="End Date"
              type="date"
              value={form.period_end}
              onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField
              label="Pay Date"
              type="date"
              value={form.pay_date}
              onChange={(e) => setForm((f) => ({ ...f, pay_date: e.target.value }))}
            />
            <FormField
              label="Working Days"
              type="number"
              min="0"
              max="31"
              placeholder="Auto if left blank"
              value={form.working_days}
              onChange={(e) => setForm((f) => ({ ...f, working_days: e.target.value }))}
            />
          </div>

          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional context for this run…"
              rows={2}
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
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
                {editing ? "Save Changes" : "Create Period"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This draft period will be removed. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PayrollLayout>
  );
}
