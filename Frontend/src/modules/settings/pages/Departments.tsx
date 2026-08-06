import { useEffect, useState, type FormEvent } from "react";
import { Network, Plus, Pencil, Trash2 } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ReassignDeleteDialog, { type ReassignBlocker } from "@/components/dialogs/ReassignDeleteDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import {
 departmentsApi,
 type Department,
 type DepartmentDeleteImpact,
} from "@/modules/settings/api/settingsApi";


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
 const [impact, setImpact] = useState<DepartmentDeleteImpact | null>(null);
 const [impactLoading, setImpactLoading] = useState(false);
 const [deleteError, setDeleteError] = useState<string | null>(null);
 // Every department, not just the current page — the move-to dropdown has to
 // offer all of them, and `rows` only holds one page's worth.
 const [allDepartments, setAllDepartments] = useState<Department[]>([]);

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

 const openDelete = (dept: Department) => {
 setDeleteTarget(dept);
 setImpact(null);
 setDeleteError(null);
 setImpactLoading(true);

 // Both in parallel: the counts that decide what the dialog says, and the
 // full list that populates the move-to dropdown.
 Promise.all([
 departmentsApi.deleteImpact(dept.departmentId),
 departmentsApi.listAll().then(
 (res) => res.data,
 () => [] as Department[],
 ),
 ])
 .then(([res, all]) => {
 setImpact(res);
 setAllDepartments(all);
 })
 .catch(() => {
 // Impact unknown — the dialog falls back to a plain confirm. The server
 // still refuses with its 409 if anything is attached, so the worst case
 // here is the old behaviour, not a bad delete.
 setImpact(null);
 setDeleteError("Couldn't check what's attached. Deleting will still be blocked if anything is.");
 })
 .finally(() => setImpactLoading(false));
 };

 // targetId is null when nothing is attached (plain delete) and a department id
 // when the user picked somewhere to move the contents.
 const handleDelete = async (targetId: string | null) => {
 if (!deleteTarget) return;
 setDeleting(true);
 setDeleteError(null);
 try {
 if (targetId) {
 const res = await departmentsApi.reassignAndDelete(deleteTarget.departmentId, targetId);
 toast.showSuccess(res.message);
 } else {
 await departmentsApi.remove(deleteTarget.departmentId);
 toast.showSuccess("Department deleted.");
 }
 setDeleteTarget(null);
 load();
 } catch (err) {
 // Kept in the dialog rather than a toast: the dialog stays open so the
 // user can pick a different target instead of starting the whole flow over.
 setDeleteError(err instanceof Error ? err.message : "Couldn't delete department.");
 } finally {
 setDeleting(false);
 }
 };

 const blockers: ReassignBlocker[] | null = impact
 ? [
 impact.employee_count > 0
 ? { label: `${impact.employee_count} employee${impact.employee_count === 1 ? "" : "s"}` }
 : null,
 impact.designation_count > 0
 ? {
 label: `${impact.designation_count} designation${impact.designation_count === 1 ? "" : "s"}`,
 detail: impact.designations_in_use > 0 ? `(${impact.designations_in_use} in use)` : undefined,
 }
 : null,
 ].filter((b): b is ReassignBlocker => b !== null)
 : null;

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
 onClick={() => openDelete(d)}
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

 <ReassignDeleteDialog
 open={!!deleteTarget}
 title={`Delete "${deleteTarget?.name}"?`}
 blockers={blockers}
 loadingImpact={impactLoading}
 // Nothing cascades here — designations.department_id and
 // users.department_id are both ON DELETE NO ACTION — so anything attached
 // has to be moved somewhere first. The dropdown offers every other
 // department; the current one is filtered out because the server rejects
 // moving a department into itself.
 targets={allDepartments
 .filter((d) => d.departmentId !== deleteTarget?.departmentId)
 .map((d) => ({ id: d.departmentId, label: d.name }))}
 targetLabel="Department"
 emptyDescription="Nothing is attached to this department. This action cannot be undone."
 submitting={deleting}
 error={deleteError}
 onConfirm={handleDelete}
 onCancel={() => setDeleteTarget(null)}
 />
 </SettingsLayout>
 );
}
