import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Plus, Pencil, Trash2 } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import InfoTip from "@/components/common/InfoTip";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { permissionsApi, type Permission } from "@/modules/settings/api/settingsApi";


type FormState = { name: string; description: string };
const EMPTY_FORM: FormState = { name: "", description: "" };

export default function PermissionsPage() {
 const status = useBackendStatus();
 const toast = useToast();

 const [rows, setRows] = useState<Permission[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(10);

 const [modalOpen, setModalOpen] = useState(false);
 const [editing, setEditing] = useState<Permission | null>(null);
 const [form, setForm] = useState<FormState>(EMPTY_FORM);
 const [formError, setFormError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const [deleteTarget, setDeleteTarget] = useState<Permission | null>(null);
 const [deleting, setDeleting] = useState(false);

 const load = () => {
 setLoading(true);
 permissionsApi
 .list({ search, page, pageSize })
 .then((res) => {
 setRows(res.data);
 setTotal(res.total);
 })
 .catch(() => toast.showError("Couldn't load permissions."))
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

 const openEdit = (permission: Permission) => {
 setEditing(permission);
 setForm({ name: permission.name, description: permission.description });
 setFormError(null);
 setModalOpen(true);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!form.name.trim()) {
 setFormError("Permission key is required.");
 return;
 }
 setSaving(true);
 setFormError(null);
 try {
 if (editing) {
 await permissionsApi.update(editing.permissionId, form);
 toast.showSuccess("Permission updated.");
 } else {
 await permissionsApi.create(form);
 toast.showSuccess("Permission created.");
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
 await permissionsApi.remove(deleteTarget.permissionId);
 toast.showSuccess("Permission deleted.");
 setDeleteTarget(null);
 load();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't delete permission.");
 } finally {
 setDeleting(false);
 }
 };

 const columns: DataTableColumn<Permission>[] = [
 { key: "name", label: "Permission", render: (p) => <code className="text-xs font-semibold text-gray-900">{p.name}</code> },
 { key: "module", label: "Module", render: (p) => <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">{p.module}</span> },
 { key: "description", label: "Description", render: (p) => <span className="line-clamp-2 max-w-sm">{p.description || "—"}</span>, hideBelow: "md" },
 ];

 return (
 <SettingsLayout activeTab="/settings/permissions">
 <BackendStatusBanner status={status} />

 <p className="mb-4 text-sm text-gray-500">
 Permissions are the individual capabilities you can bundle into a Role. Assign them to roles from the{" "}
 <span className="font-medium text-gray-700">Roles</span> tab.
 </p>

 <DataTable
 columns={columns}
 rows={rows}
 rowKey={(p) => p.permissionId}
 loading={loading}
 search={search}
 onSearchChange={setSearch}
 searchPlaceholder="Search permissions…"
 emptyIcon={KeyRound}
 emptyTitle="No permissions yet"
 emptyDescription="Define granular permissions like users.manage or payroll.manage."
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
 <Plus size={16} /> Add Permission
 </button>
 }
 actions={(p) => (
 <div className="flex items-center justify-end gap-1.5">
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
 </div>
 )}
 />

 <Modal
 open={modalOpen}
 onClose={() => setModalOpen(false)}
 title={editing ? "Edit Permission" : "Add Permission"}
 description={
 editing
 ? "Rename this permission or reword its description."
 : "Define a new granular permission."
 }
 >
 <form onSubmit={handleSubmit}>
 <FormField
 label="Permission Key"
 placeholder="e.g. CREATE_USER or payroll.manage"
 value={form.name}
 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
 required
 />
 {editing && (
 <p className="-mt-3 mb-5 flex items-start gap-1.5 text-xs text-amber-700">
 <span>Renaming revokes access wherever the old key is still checked.</span>
 <InfoTip
 side="bottom"
 label="What renaming a permission key affects"
 text="The backend compares this exact string against the key each route requires. Rename it and any route still asking for the old key will refuse every role that held it, until the route is updated too."
 />
 </p>
 )}
 <label className="mb-6 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
 <textarea
 value={form.description}
 onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
 placeholder="What does this permission allow?"
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
 {editing ? "Save Changes" : "Create Permission"}
 </PrimaryButton>
 </div>
 </div>
 </form>
 </Modal>

 <ConfirmDialog
 open={!!deleteTarget}
 title={`Delete "${deleteTarget?.name}"?`}
 description="Roles currently granting this permission will lose it. This action cannot be undone."
 confirmLabel="Delete"
 tone="danger"
 loading={deleting}
 onConfirm={handleDelete}
 onCancel={() => setDeleteTarget(null)}
 />
 </SettingsLayout>
 );
}
