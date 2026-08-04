import { useEffect, useState, type FormEvent } from "react";
import { CalendarRange, Plus, Pencil, Trash2 } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { leaveTypesApi, type LeaveType } from "@/modules/settings/api/settingsApi";

type FormState = {
 leaveTypeName: string;
 description: string;
 allocatedDays: string;
 isPaid: boolean;
 isActive: boolean;
 carryForwardAllowed: boolean;
 // Kept as a string so the input can be transiently empty while typing;
 // parsed and validated on submit like allocatedDays.
 maxCarryForwardDays: string;
};
const EMPTY_FORM: FormState = {
 leaveTypeName: "",
 description: "",
 allocatedDays: "0",
 isPaid: true,
 isActive: true,
 carryForwardAllowed: false,
 maxCarryForwardDays: "0",
};

export default function LeaveTypesPage() {
 const status = useBackendStatus();
 const toast = useToast();

 const [rows, setRows] = useState<LeaveType[]>([]);
 const [total, setTotal] = useState(0);
 const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [page, setPage] = useState(1);
 const [pageSize, setPageSize] = useState(10);

 const [modalOpen, setModalOpen] = useState(false);
 const [editing, setEditing] = useState<LeaveType | null>(null);
 const [form, setForm] = useState<FormState>(EMPTY_FORM);
 const [formError, setFormError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null);
 const [deleting, setDeleting] = useState(false);

 const load = () => {
 setLoading(true);
 leaveTypesApi
 .list({ search, page, pageSize })
 .then((res) => {
 setRows(res.data);
 setTotal(res.total);
 })
 .catch(() => toast.showError("Couldn't load leave types."))
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

 const openEdit = (lt: LeaveType) => {
 setEditing(lt);
 setForm({
 leaveTypeName: lt.leaveTypeName,
 description: lt.description ?? "",
 allocatedDays: String(lt.allocatedDays),
 isPaid: lt.isPaid,
 isActive: lt.isActive,
 carryForwardAllowed: lt.carryForwardAllowed,
 maxCarryForwardDays: String(lt.maxCarryForwardDays),
 });
 setFormError(null);
 setModalOpen(true);
 };

 const handleSubmit = async (e: FormEvent) => {
 e.preventDefault();
 if (!form.leaveTypeName.trim()) {
 setFormError("Leave type name is required.");
 return;
 }
 const days = Number(form.allocatedDays);
 if (form.allocatedDays.trim() === "" || Number.isNaN(days) || days < 0) {
 setFormError("Enter a valid number of allocated days (0 or more).");
 return;
 }
 // Only meaningful when carry-forward is on; forced to 0 otherwise so a stale
 // number can't linger in the database and confuse next year's balance run.
 const carryDays = form.carryForwardAllowed ? Number(form.maxCarryForwardDays) : 0;
 if (form.carryForwardAllowed) {
 if (form.maxCarryForwardDays.trim() === "" || Number.isNaN(carryDays) || carryDays < 0) {
 setFormError("Enter a valid number of carry-forward days (0 or more).");
 return;
 }
 if (carryDays > days) {
 setFormError("Carry-forward days can't exceed the annual allocation.");
 return;
 }
 }
 setSaving(true);
 setFormError(null);
 const payload = {
 leaveTypeName: form.leaveTypeName.trim(),
 description: form.description.trim(),
 allocatedDays: days,
 isPaid: form.isPaid,
 isActive: form.isActive,
 carryForwardAllowed: form.carryForwardAllowed,
 maxCarryForwardDays: carryDays,
 };
 try {
 if (editing) {
 await leaveTypesApi.update(editing.leaveTypeId, payload);
 toast.showSuccess("Leave type updated.");
 } else {
 await leaveTypesApi.create(payload);
 toast.showSuccess("Leave type created.");
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
 await leaveTypesApi.remove(deleteTarget.leaveTypeId);
 toast.showSuccess("Leave type deleted.");
 setDeleteTarget(null);
 load();
 } catch (err) {
 toast.showError(err instanceof Error ? err.message : "Couldn't delete leave type.");
 } finally {
 setDeleting(false);
 }
 };

 const columns: DataTableColumn<LeaveType>[] = [
 {
 key: "name",
 label: "Leave Type",
 render: (lt) => (
 <span className="flex items-center gap-2">
 <span className="font-medium text-gray-900">{lt.leaveTypeName}</span>
 {/* Inactive types stay listed but are excluded from the Apply Leave
 dropdown, so the row needs to say why it looks "missing" there. */}
 {!lt.isActive && (
 <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">Inactive</span>
 )}
 </span>
 ),
 },
 {
 key: "description",
 label: "Description",
 render: (lt) => <span className="line-clamp-2 max-w-sm text-gray-600">{lt.description || "—"}</span>,
 hideBelow: "md",
 },
 {
 key: "allocatedDays",
 label: "Days / Year",
 render: (lt) => <span className="tabular-nums">{lt.allocatedDays}</span>,
 hideBelow: "md",
 },
 {
 key: "isPaid",
 label: "Paid",
 render: (lt) =>
 lt.isPaid ? (
 <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Paid</span>
 ) : (
 <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Unpaid</span>
 ),
 hideBelow: "md",
 },
 {
 key: "carryForward",
 label: "Carry Forward",
 render: (lt) => (
 <span className="text-gray-600">
 {lt.carryForwardAllowed ? `Up to ${lt.maxCarryForwardDays} ${lt.maxCarryForwardDays === 1 ? "day" : "days"}` : "Not allowed"}
 </span>
 ),
 hideBelow: "lg",
 },
 ];

 return (
 <SettingsLayout activeTab="/settings/leave-types">
 <BackendStatusBanner status={status} />

 <p className="mb-4 text-sm text-gray-500">
 Define the kinds of leave employees can request — e.g. Annual, Sick, or Casual — along with how many days are
 allocated per year and whether they're paid. These show up on the <span className="font-medium text-gray-700">Leave Type</span>{" "}
 field on the Add/Edit Employee form and on the Apply Leave screen.
 </p>

 <DataTable
 columns={columns}
 rows={rows}
 rowKey={(lt) => lt.leaveTypeId}
 loading={loading}
 search={search}
 onSearchChange={setSearch}
 searchPlaceholder="Search leave types…"
 emptyIcon={CalendarRange}
 emptyTitle="No leave types yet"
 emptyDescription="Create your first leave type, like Annual Leave or Sick Leave."
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
 <Plus size={16} /> Add Leave Type
 </button>
 }
 actions={(lt) => (
 <div className="flex items-center justify-end gap-1.5">
 <button
 type="button"
 onClick={() => openEdit(lt)}
 aria-label={`Edit ${lt.leaveTypeName}`}
 className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
 >
 <Pencil size={15} />
 </button>
 <button
 type="button"
 onClick={() => setDeleteTarget(lt)}
 aria-label={`Delete ${lt.leaveTypeName}`}
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
 title={editing ? "Edit Leave Type" : "Add Leave Type"}
 description={editing ? "Update this leave type's details." : "Create a new leave type employees can apply for."}
 >
 <form onSubmit={handleSubmit}>
 <FormField
 label="Leave Type Name"
 placeholder="e.g. Annual Leave"
 value={form.leaveTypeName}
 onChange={(e) => setForm((f) => ({ ...f, leaveTypeName: e.target.value }))}
 required
 />
 <label className="mb-5 block">
 <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
 <textarea
 value={form.description}
 onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
 placeholder="What kind of leave is this for?"
 rows={3}
 className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
 />
 </label>
 <FormField
 label="Allocated Days / Year"
 type="number"
 min="0"
 step="1"
 placeholder="e.g. 18"
 value={form.allocatedDays}
 onChange={(e) => setForm((f) => ({ ...f, allocatedDays: e.target.value }))}
 required
 />

 <label className="mb-4 flex items-center gap-2.5 text-sm text-gray-700">
 <input
 type="checkbox"
 checked={form.isPaid}
 onChange={(e) => setForm((f) => ({ ...f, isPaid: e.target.checked }))}
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 <span>
 <span className="font-medium text-gray-900">Paid leave</span>
 <span className="ml-1.5 text-gray-500">— salary is not deducted for these days.</span>
 </span>
 </label>

 <label className="mb-4 flex items-center gap-2.5 text-sm text-gray-700">
 <input
 type="checkbox"
 checked={form.carryForwardAllowed}
 onChange={(e) => setForm((f) => ({ ...f, carryForwardAllowed: e.target.checked }))}
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 <span>
 <span className="font-medium text-gray-900">Allow carry forward</span>
 <span className="ml-1.5 text-gray-500">— unused days roll into next year.</span>
 </span>
 </label>

 {/* Only rendered when carry-forward is on: an always-visible cap that
 does nothing invites someone to set it and assume it took effect. */}
 {form.carryForwardAllowed && (
 <FormField
 label="Max Carry Forward Days"
 type="number"
 min="0"
 step="1"
 placeholder="e.g. 5"
 value={form.maxCarryForwardDays}
 onChange={(e) => setForm((f) => ({ ...f, maxCarryForwardDays: e.target.value }))}
 />
 )}

 <label className="mb-5 flex items-center gap-2.5 text-sm text-gray-700">
 <input
 type="checkbox"
 checked={form.isActive}
 onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
 className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
 />
 <span>
 <span className="font-medium text-gray-900">Active</span>
 <span className="ml-1.5 text-gray-500">— employees can select this when applying for leave.</span>
 </span>
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
 {editing ? "Save Changes" : "Create Leave Type"}
 </PrimaryButton>
 </div>
 </div>
 </form>
 </Modal>

 <ConfirmDialog
 open={!!deleteTarget}
 title={`Delete "${deleteTarget?.leaveTypeName}"?`}
 description="Employees will no longer be able to request this leave type. This action cannot be undone."
 confirmLabel="Delete"
 tone="danger"
 loading={deleting}
 onConfirm={handleDelete}
 onCancel={() => setDeleteTarget(null)}
 />
 </SettingsLayout>
 );
}
