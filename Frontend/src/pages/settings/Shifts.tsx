import { useEffect, useState, type FormEvent } from "react";
import { Clock, Plus, Pencil, Trash2 } from "lucide-react";
import SettingsLayout from "./SettingsLayout";
import DataTable, { type DataTableColumn } from "../../components/DataTable";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { PrimaryButton } from "../../components/FormField";
import BackendStatusBanner from "../../components/BackendStatusBanner";
import { useBackendStatus } from "../../hooks/useBackendStatus";
import { useToast } from "../../lib/ToastContext";
import { shiftsApi, type Shift } from "../../lib/settingsApi";


type FormState = {
  name: string;
  startTime: string;
  endTime: string;
  gracePeriodMinutes: number;
  status: "active" | "inactive";
};
const EMPTY_FORM: FormState = { name: "", startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 15, status: "active" };

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export default function ShiftsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<Shift[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    shiftsApi
      .list({ search, page, pageSize })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.showError("Couldn't load shifts."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize]);

  useEffect(() => setPage(1), [search, pageSize]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: Shift) => {
    setEditing(item);
    setForm({
      name: item.name,
      startTime: item.startTime,
      endTime: item.endTime,
      gracePeriodMinutes: item.gracePeriodMinutes,
      status: item.status,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Shift name is required.");
      return;
    }
    if (!form.startTime || !form.endTime) {
      setFormError("Start and end time are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await shiftsApi.update(editing.shiftId, form);
        toast.showSuccess("Shift updated.");
      } else {
        await shiftsApi.create(form);
        toast.showSuccess("Shift created.");
      }
      setModalOpen(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await shiftsApi.remove(deleteTarget.shiftId);
      toast.showSuccess("Shift deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete shift.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<Shift>[] = [
    { key: "name", label: "Shift Name", render: (s) => <span className="font-medium text-gray-900">{s.name}</span> },
    { key: "timing", label: "Timing", render: (s) => `${formatTime(s.startTime)} – ${formatTime(s.endTime)}` },
    { key: "grace", label: "Grace Period", render: (s) => `${s.gracePeriodMinutes} min`, hideBelow: "md" },
  ];

  return (
    <SettingsLayout activeTab="/settings/shifts">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.shiftId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search shifts…"
        emptyIcon={Clock}
        emptyTitle="No shifts yet"
        emptyDescription="Define shifts like General, Morning, Evening, or Night to schedule employees against."
        page={page}
        pageSize={pageSize}
        onPageSizeChange={(size) => setPageSize(size)}
        pageSizeOptions={[10, 25, 50]}
        total={total}
        onPageChange={setPage}
        toolbarRight={
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} /> Add Shift
          </button>
        }
        actions={(s) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(s)}
              aria-label={`Edit ${s.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(s)}
              aria-label={`Delete ${s.name}`}
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
        title={editing ? "Edit Shift" : "Add Shift"}
        description={editing ? "Update this shift's timing." : "Define a new work shift."}
      >
        <form onSubmit={handleSubmit}>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Shift Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. General Shift"
              required
              className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <div className="mb-5 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">Start Time</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                required
                className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">End Time</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                required
                className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              />
            </label>
          </div>

          <label className="mb-6 block max-w-[200px]">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Grace Period (min)</span>
            <input
              type="number"
              min={0}
              max={120}
              value={form.gracePeriodMinutes}
              onChange={(e) => setForm((f) => ({ ...f, gracePeriodMinutes: Number(e.target.value) }))}
              className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
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
                {editing ? "Save Changes" : "Create Shift"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Employees currently assigned this shift will need to be reassigned. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SettingsLayout>
  );
}
