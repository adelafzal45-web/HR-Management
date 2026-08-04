import { useEffect, useState, type FormEvent } from "react";
import { Network, Plus, Pencil, Trash2 } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { departmentsApi, type Department } from "@/modules/settings/api/settingsApi";


type FormState = { name: string; description: string; status: "active" | "inactive" };
const EMPTY_FORM: FormState = { name: "", description: "", status: "active" };

export default function DepartmentsPage() {
 const status = useBackendStatus();
 const toast = useToast();

 const [rows, setRows] = useState<Department[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(10);

 const [modalOpen, setModalOpen] = useState(false);
 const [editing, setEditing] = useState<Department | null>(null);
 const [form, setForm] = useState<FormState>(EMPTY_FORM);
 const [formError, setFormError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const [deleteTarget, setDeleteTarget] = useState<Department | null>(null);
 const [deleting, setDeleting] = useState(false);

 const load = () => {
 setLoading(true);
 departmentsApi
 .list({ search, page, pageSize })
 .then((res) => {
 setRows(res.data);
 setTotal(res.total);
 })
 .catch(() => toast.showError("Couldn't load departments."))
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

 const openEdit = (dept: Department) => {
 setEditing(dept);
 setForm({ name: dept.name, description: dept.description, status: dept.status });
 setFormError(null);
 setModalOpen(true);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!form.name.trim()) {
 setFormError("Department name is required.");
 return;
 }
 setSaving(true);
 setFormError(null);
 try {
 if (editing) {
 await departmentsApi.update(editing.departmentId, form);
 toast.showSuccess("Department updated.");
 } else {
 await departmentsApi.create(form);
 toast.showSuccess("Department created.");
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
 await departmentsApi.remove(deleteTarget.departmentId);
 toast.showSuccess("Department deleted.");
 setDeleteTarget(null);
 load();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't delete department.");
 } finally {
 setDeleting(false);
 }
 };

 const columns: DataTableColumn<Department>[] = [
 { key: "name", label: "Department Name", render: (d) => <span className="font-medium text-gray-900">{d.name}</span> },
 {
 key: "description",
 label: "Description",
 render: (d) => <span className="line-clamp-2 max-w-sm text-gray-600">{d.description || "—"}</span>,
 hideBelow: "md",
 },
 ];

 return (
 <SettingsLayout activeTab="/settings/departments">
 <BackendStatusBanner status={status} />

 <DataTable
 columns={columns}
 rows={rows}
 rowKey={(d) => d.departmentId}
 loading={loading}
 search={search}
 onSearchChange={setSearch}
 searchPlaceholder="Search departments…"
 emptyIcon={Network}
 emptyTitle="No departments yet"
 emptyDescription="Create your first department to start organizing your workforce."
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
 <Plus size={16} /> Add Department
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
 title={editing ? "Edit Department" : "Add Department"}
 description={editing ? "Update this department's details." : "Create a new department for your organization."}
 >
 <form onSubmit={handleSubmit}>
 <FormField
 label="Department Name"
 placeholder="e.g. Engineering"
 value={form.name}
 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
 required
 />
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
 <textarea
 value={form.description}
 onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
 placeholder="What does this department do?"
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
 {editing ? "Save Changes" : "Create Department"}
 </PrimaryButton>
 </div>
 </div>
 </form>
 </Modal>

 <ConfirmDialog
 open={!!deleteTarget}
 title={`Delete "${deleteTarget?.name}"?`}
 description="This will also remove any designations linked to this department. This action cannot be undone."
 confirmLabel="Delete"
 tone="danger"
 loading={deleting}
 onConfirm={handleDelete}
 onCancel={() => setDeleteTarget(null)}
 />
 </SettingsLayout>
 );
}
