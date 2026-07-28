import { useEffect, useState, type FormEvent } from "react";
import { IdCard, Plus, Pencil, Trash2 } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { designationsApi, departmentsApi, type Designation, type Department } from "@/modules/settings/api/settingsApi";


type FormState = { name: string; departmentId: string; description: string; status: "active" | "inactive" };
const EMPTY_FORM: FormState = { name: "", departmentId: "", description: "", status: "active" };

export default function DesignationsPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<Designation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Designation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    designationsApi
      .list({ search, page, pageSize })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.showError("Couldn't load designations."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize]);

  useEffect(() => setPage(1), [search, pageSize]);

  useEffect(() => {
    departmentsApi
      .listAll()
      .then((res) => setDepartments(res.data))
      .catch(() => {});
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, departmentId: departments[0]?.departmentId ?? "" });
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: Designation) => {
    setEditing(item);
    setForm({ name: item.name, departmentId: item.departmentId, description: item.description, status: item.status });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Designation name is required.");
      return;
    }
    if (!form.departmentId) {
      setFormError("Please select a department.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await designationsApi.update(editing.designationId, form);
        toast.showSuccess("Designation updated.");
      } else {
        await designationsApi.create(form);
        toast.showSuccess("Designation created.");
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
      await designationsApi.remove(deleteTarget.designationId);
      toast.showSuccess("Designation deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete designation.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<Designation>[] = [
    { key: "name", label: "Designation Name", render: (d) => <span className="font-medium text-gray-900">{d.name}</span> },
    { key: "department", label: "Department", render: (d) => d.departmentName },
  ];

  return (
    <SettingsLayout activeTab="/settings/designations">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(d) => d.designationId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search designations…"
        emptyIcon={IdCard}
        emptyTitle="No designations yet"
        emptyDescription="Add job titles like Software Engineer or HR Executive to a department."
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
            disabled={departments.length === 0}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} /> Add Designation
          </button>
        }
        actions={(d) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(d)}
              aria-label={`Edit ${d.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(d)}
              aria-label={`Delete ${d.name}`}
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
        title={editing ? "Edit Designation" : "Add Designation"}
        description={editing ? "Update this designation's details." : "Create a new job title under a department."}
      >
        <form onSubmit={handleSubmit}>
          <FormField
            label="Designation Name"
            placeholder="e.g. Software Engineer"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Department</span>
            <select
              value={form.departmentId}
              onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              className="w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand/60"
              required
            >
              <option value="" disabled>
                Select a department
              </option>
              {departments.map((d) => (
                <option key={d.departmentId} value={d.departmentId}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="What does this role involve?"
              rows={3}
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
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
                {editing ? "Save Changes" : "Create Designation"}
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SettingsLayout>
  );
}
