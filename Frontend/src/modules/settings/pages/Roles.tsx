import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, Plus, Pencil, Trash2, Eye } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import Modal from "@/components/dialogs/Modal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import StatusBadge from "@/components/common/StatusBadge";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { rolesApi, permissionsApi, type Role, type Permission } from "@/modules/settings/api/settingsApi";


type FormState = { name: string; description: string; status: "active" | "inactive"; permissionIds: string[] };
const EMPTY_FORM: FormState = { name: "", description: "", status: "active", permissionIds: [] };

export default function RolesPage() {
  const status = useBackendStatus();
  const toast = useToast();

  const [rows, setRows] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    rolesApi
      .list({ search, page, pageSize })
      .then((res) => {
        setRows(res.data);
        setTotal(res.total);
      })
      .catch(() => toast.showError("Couldn't load roles."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page, pageSize]);

  useEffect(() => setPage(1), [search, pageSize]);

  useEffect(() => {
    permissionsApi
      .listAll()
      .then(setPermissions)
      .catch(() => {});
  }, []);

  const permissionsByModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p);
    return acc;
  }, {});

  const openCreate = () => {
    setEditing(null);
    setReadOnly(false);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (role: Role, view = false) => {
    setEditing(role);
    setReadOnly(view);
    setForm({ name: role.name, description: role.description, status: role.status, permissionIds: role.permissionIds });
    setFormError(null);
    setModalOpen(true);
  };

  const togglePermission = (id: string) => {
    if (readOnly) return;
    setForm((f) => ({
      ...f,
      permissionIds: f.permissionIds.includes(id) ? f.permissionIds.filter((p) => p !== id) : [...f.permissionIds, id],
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!form.name.trim()) {
      setFormError("Role name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await rolesApi.update(editing.roleId, form);
        toast.showSuccess("Role updated.");
      } else {
        await rolesApi.create(form);
        toast.showSuccess("Role created.");
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
      await rolesApi.remove(deleteTarget.roleId);
      toast.showSuccess("Role deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete role.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<Role>[] = [
    { key: "name", label: "Role Name", render: (r) => <span className="font-medium text-gray-900">{r.name}</span> },
    { key: "description", label: "Description", render: (r) => <span className="line-clamp-2 max-w-xs">{r.description || "—"}</span>, hideBelow: "md" },
    {
      key: "permissions",
      label: "Permissions",
      render: (r) => <span className="text-xs text-gray-500">{r.permissionIds.length} assigned</span>,
      hideBelow: "lg",
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <SettingsLayout activeTab="/settings/roles">
      <BackendStatusBanner status={status} />

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.roleId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search roles…"
        emptyIcon={ShieldCheck}
        emptyTitle="No roles yet"
        emptyDescription="Create a role and assign permissions to control what users can access."
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
            <Plus size={16} /> Add Role
          </button>
        }
        actions={(r) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => openEdit(r, true)}
              aria-label={`View ${r.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              onClick={() => openEdit(r, false)}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={readOnly ? `${editing?.name} — Permissions` : editing ? "Edit Role" : "Add Role"}
        description={readOnly ? "Viewing assigned permissions for this role." : "Define a role and assign the permissions it should grant."}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit}>
          <fieldset disabled={readOnly} className="contents">
            <FormField
              label="Role Name"
              placeholder="e.g. HR Manager"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">Description</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this role responsible for?"
                rows={2}
                className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 disabled:opacity-70"
              />
            </label>
          </fieldset>

          <span className="mb-2 block text-[15px] font-medium text-gray-900">Permissions</span>
          <div className="mb-6 max-h-72 space-y-4 overflow-y-auto rounded-xl bg-gray-50 p-4">
            {Object.entries(permissionsByModule).map(([module, perms]) => (
              <div key={module}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{module}</p>
                <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
                  {perms.map((p) => (
                    <label
                      key={p.permissionId}
                      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                        form.permissionIds.includes(p.permissionId) ? "border-brand bg-brand-light/60" : "border-gray-200 bg-white"
                      } ${readOnly ? "" : "cursor-pointer hover:border-brand"}`}
                    >
                      <input
                        type="checkbox"
                        checked={form.permissionIds.includes(p.permissionId)}
                        onChange={() => togglePermission(p.permissionId)}
                        disabled={readOnly}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-dark focus:ring-brand"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-800">{p.name}</span>
                        <span className="block truncate text-xs text-gray-500">{p.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {permissions.length === 0 && <p className="text-sm text-gray-500">No permissions defined yet.</p>}
          </div>

          {formError && <p className="mb-4 text-sm text-red-500">{formError}</p>}

          <div className="flex flex-col-reverse gap-2.5 xs:flex-row">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="min-h-11 flex-1 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <div className="flex-1">
                <PrimaryButton type="submit" loading={saving}>
                  {editing ? "Save Changes" : "Create Role"}
                </PrimaryButton>
              </div>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        description="Users currently assigned this role will lose its permissions. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SettingsLayout>
  );
}
