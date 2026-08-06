import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Plus, Pencil, Trash2, Eye } from "lucide-react";
import SettingsLayout from "@/modules/settings/pages/SettingsLayout";
import DataTable, { type DataTableColumn } from "@/components/tables/DataTable";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { rolesApi, type Role } from "@/modules/settings/api/settingsApi";

/**
 * The roles list, and nothing else.
 *
 * Add / Edit / View used to open a dialog over this table. They are now routes
 * (`/settings/roles/new`, `/:roleId/edit`, `/:roleId`) rendered by `RoleDetail`
 * — the permission matrix needs the width, and the three states deserve real
 * URLs and a working browser Back. Delete stays a dialog: a destructive confirm
 * is exactly what a dialog is for.
 */
export default function RolesPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const navigate = useNavigate();

  const [rows, setRows] = useState<Role[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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
            onClick={() => navigate("/settings/roles/new")}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} /> Add Role
          </button>
        }
        actions={(r) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => navigate(`/settings/roles/${r.roleId}`)}
              aria-label={`View ${r.name}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              onClick={() => navigate(`/settings/roles/${r.roleId}/edit`)}
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
