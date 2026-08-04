import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Plus,
  Pencil,
  Eye,
  Trash2,
  Power,
  CircleCheck,
  CircleSlash,
} from "lucide-react";
import DashboardLayout from "@/app/layouts/DashboardLayout";
import ProfessionalDataGrid, { type GridColumn, type FilterChip, type BulkAction } from "@/modules/professionals/components/ProfessionalDataGrid";
import AdvancedFilterDrawer, { EMPTY_FILTERS, type ProfessionalFilters, type SavedFilter } from "@/modules/professionals/components/AdvancedFilterDrawer";
import ImportProfessionalsModal, { type ImportRow } from "@/modules/professionals/components/ImportProfessionalsModal";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import StatusBadge from "@/components/common/StatusBadge";
import EmployeeAvatar from "@/modules/employees/components/EmployeeAvatar";
import BackendStatusBanner from "@/components/common/BackendStatusBanner";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { useToast } from "@/app/providers/ToastContext";
import { toCSV, downloadCSV } from "@/utils/csv";
import { exportExcel, exportPDF, type ExportFormat } from "@/utils/exportUtils";
import { formatDisplayDate } from "@/utils/formatDate";
import { professionalsApi, type Professional, type ProfessionalStatus } from "@/modules/professionals/api/professionalApi";
import {
  departmentsApi,
  designationsApi,
  jobCategoriesApi,
  shiftsApi,
  rolesApi,
  type Department,
  type Designation,
  type JobCategory,
  type Shift,
  type Role,
} from "@/modules/settings/api/settingsApi";

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-Time" },
  { value: "part_time", label: "Part-Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
] as const;

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = Object.fromEntries(EMPLOYMENT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SAVED_FILTERS_KEY = "technocues:professionals:savedFilters";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function loadSavedFilters(): SavedFilter[] {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedFilters(filters: SavedFilter[]) {
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    // ignore — saved views just won't persist in this browser
  }
}

export default function ProfessionalsPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const navigate = useNavigate();

  // The grid does its own client-side search/filter/sort/pagination, so we
  // load the full professional set once and let it work off that — the same
  // "one in-memory source of truth" pattern the mock API itself already
  // uses under the hood.
  const [allProfessionals, setAllProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ProfessionalFilters>(EMPTY_FILTERS);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => loadSavedFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [deleteTarget, setDeleteTarget] = useState<Professional | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Professional | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    professionalsApi
      .list({ pageSize: 1000 })
      .then((res) => setAllProfessionals(res.data))
      .catch(() => toast.showError("Couldn't load professionals."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reference data for the form dropdowns + filter drawer.
  useEffect(() => {
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
    designationsApi.list({ pageSize: 1000 }).then((res) => setDesignations(res.data)).catch(() => undefined);
    jobCategoriesApi.list({ pageSize: 1000 }).then((res) => setJobCategories(res.data)).catch(() => undefined);
    shiftsApi.list({ pageSize: 1000 }).then((res) => setShifts(res.data)).catch(() => undefined);
    rolesApi.list({ pageSize: 1000 }).then((res) => setRoles(res.data)).catch(() => undefined);
  }, []);

  // ---- filtering (search + advanced filters), all client-side ----------
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allProfessionals.filter((e) => {
      if (needle) {
        const haystack = [e.firstName, e.lastName, e.professionalCode, e.email, e.phone, e.departmentName, e.designationName].join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filters.departmentId && e.departmentId !== filters.departmentId) return false;
      if (filters.designationId && e.designationId !== filters.designationId) return false;
      if (filters.status && e.status !== filters.status) return false;
      if (filters.shiftId && e.shiftId !== filters.shiftId) return false;
      if (filters.roleId && e.roleId !== filters.roleId) return false;
      if (filters.managerId && e.managerId !== filters.managerId) return false;
      if (filters.employmentType && e.employmentType !== filters.employmentType) return false;
      if (filters.dateFrom && e.joiningDate < filters.dateFrom) return false;
      if (filters.dateTo && e.joiningDate > filters.dateTo) return false;
      return true;
    });
  }, [allProfessionals, search, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    const clear = (key: keyof ProfessionalFilters) => setFilters((f) => ({ ...f, [key]: "" }));
    if (filters.departmentId) {
      const name = departments.find((d) => d.departmentId === filters.departmentId)?.name ?? "Department";
      chips.push({ key: "departmentId", label: `Dept: ${name}`, onRemove: () => clear("departmentId") });
    }
    if (filters.designationId) {
      const name = designations.find((d) => d.designationId === filters.designationId)?.name ?? "Designation";
      chips.push({ key: "designationId", label: `Designation: ${name}`, onRemove: () => clear("designationId") });
    }
    if (filters.status) {
      chips.push({ key: "status", label: `Status: ${filters.status === "active" ? "Active" : "Inactive"}`, onRemove: () => clear("status") });
    }
    if (filters.shiftId) {
      const name = shifts.find((s) => s.shiftId === filters.shiftId)?.name ?? "Shift";
      chips.push({ key: "shiftId", label: `Shift: ${name}`, onRemove: () => clear("shiftId") });
    }
    if (filters.roleId) {
      const name = roles.find((r) => r.roleId === filters.roleId)?.name ?? "Role";
      chips.push({ key: "roleId", label: `Role: ${name}`, onRemove: () => clear("roleId") });
    }
    if (filters.managerId) {
      const emp = allProfessionals.find((e) => e.professionalId === filters.managerId);
      chips.push({ key: "managerId", label: `Manager: ${emp ? `${emp.firstName} ${emp.lastName}` : "—"}`, onRemove: () => clear("managerId") });
    }
    if (filters.employmentType) {
      chips.push({
        key: "employmentType",
        label: `Type: ${EMPLOYMENT_TYPE_LABEL[filters.employmentType] ?? filters.employmentType}`,
        onRemove: () => clear("employmentType"),
      });
    }
    if (filters.dateFrom || filters.dateTo) {
      chips.push({
        key: "dateRange",
        label: `Joined: ${filters.dateFrom || "…"} → ${filters.dateTo || "…"}`,
        onRemove: () => setFilters((f) => ({ ...f, dateFrom: "", dateTo: "" })),
      });
    }
    return chips;
  }, [filters, departments, designations, shifts, roles, allProfessionals]);

  const handleSaveFilterView = (name: string) => {
    const next: SavedFilter = { id: crypto.randomUUID?.() ?? `sf-${Date.now()}`, name, filters, search };
    const updated = [...savedFilters, next];
    setSavedFilters(updated);
    persistSavedFilters(updated);
    toast.showSuccess("Filter view saved.");
  };

  const handleApplySavedFilter = (sf: SavedFilter) => {
    setFilters(sf.filters);
    setSearch(sf.search);
    toast.showSuccess(`Applied "${sf.name}".`);
  };

  const handleDeleteSavedFilter = (id: string) => {
    const updated = savedFilters.filter((sf) => sf.id !== id);
    setSavedFilters(updated);
    persistSavedFilters(updated);
  };

  const openCreate = () => navigate("/professionals/new");
  const openEdit = (emp: Professional) => navigate(`/professionals/${emp.professionalId}/edit`);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await professionalsApi.remove(deleteTarget.professionalId);
      toast.showSuccess("Professional deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete professional.");
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    const next: ProfessionalStatus = statusTarget.status === "active" ? "inactive" : "active";
    setStatusSaving(true);
    try {
      await professionalsApi.setStatus(statusTarget.professionalId, next);
      toast.showSuccess(next === "active" ? "Professional activated." : "Professional deactivated.");
      setStatusTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  // ---- bulk actions ------------------------------------------------------
  const runBulkStatus = async (ids: string[], next: ProfessionalStatus) => {
    const results = await Promise.allSettled(ids.map((id) => professionalsApi.setStatus(id, next)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) toast.showSuccess(`${ids.length} professional(s) ${next === "active" ? "activated" : "deactivated"}.`);
    else toast.showWarning(`${ids.length - failed} of ${ids.length} updated`, `${failed} row(s) failed to update.`);
    setSelectedIds(new Set());
    load();
  };

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteIds) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(bulkDeleteIds.map((id) => professionalsApi.remove(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) toast.showSuccess(`${bulkDeleteIds.length} professional(s) deleted.`);
      else toast.showWarning(`${bulkDeleteIds.length - failed} of ${bulkDeleteIds.length} deleted`, `${failed} row(s) failed to delete.`);
      setSelectedIds(new Set());
      setBulkDeleteIds(null);
      load();
    } finally {
      setBulkDeleting(false);
    }
  };

  const bulkActions: BulkAction<Professional>[] = [
    { key: "activate", label: "Activate", icon: CircleCheck, onClick: (ids) => runBulkStatus(ids, "active") },
    { key: "deactivate", label: "Deactivate", icon: CircleSlash, onClick: (ids) => runBulkStatus(ids, "inactive") },
    { key: "delete", label: "Delete", icon: Trash2, tone: "danger", onClick: (ids) => setBulkDeleteIds(ids) },
  ];

  // ---- export / import ---------------------------------------------------
  const EXPORT_COLUMNS = [
    { key: "professionalCode", label: "Professional Code" },
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "department", label: "Department" },
    { key: "designation", label: "Designation" },
    { key: "role", label: "Role" },
    { key: "manager", label: "Manager" },
    { key: "shift", label: "Shift" },
    { key: "employmentType", label: "Employment Type" },
    { key: "salary", label: "Salary" },
    { key: "joiningDate", label: "Joined" },
    { key: "status", label: "Status" },
  ];

  const handleExport = (rowsToExport: Professional[], format: ExportFormat) => {
    if (rowsToExport.length === 0) return toast.showWarning("Nothing to export.");
    const records = rowsToExport.map((e) => ({
      professionalCode: e.professionalCode,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone,
      department: e.departmentName,
      designation: e.designationName,
      role: e.roleName,
      manager: e.managerName,
      shift: e.shiftName,
      employmentType: EMPLOYMENT_TYPE_LABEL[e.employmentType] ?? e.employmentType,
      salary: e.salary,
      joiningDate: formatDisplayDate(e.joiningDate),
      status: e.status === "active" ? "Active" : "Inactive",
    }));
    const filename = `professionals-${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      const csv = toCSV(
        EXPORT_COLUMNS.map((c) => c.key),
        records,
      );
      downloadCSV(`${filename}.csv`, csv);
    } else if (format === "excel") {
      exportExcel(filename, EXPORT_COLUMNS, records);
    } else {
      const opened = exportPDF("Professionals", EXPORT_COLUMNS, records);
      if (!opened) return toast.showWarning("Couldn't open the print window.", "Check your browser's pop-up blocker and try again.");
    }
    toast.showSuccess(`Exported ${rowsToExport.length} professional(s) as ${format.toUpperCase()}.`);
  };

  const handleImport = async (rows: ImportRow[]): Promise<{ success: number; failed: number }> => {
    let success = 0;
    let failed = 0;
    const findByName = <T extends { name: string }>(list: T[], name: string | undefined) =>
      name ? list.find((x) => x.name.toLowerCase() === name.trim().toLowerCase()) : undefined;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const firstName = r.firstName || r["First Name"] || "";
      const lastName = r.lastName || r["Last Name"] || "";
      const email = r.email || r.Email || "";
      if (!firstName.trim() || !lastName.trim() || !EMAIL_RE.test(email.trim())) {
        failed++;
        continue;
      }
      const dept = findByName(departments, r.department || r.Department) ?? departments[0];
      const deptDesignations = designations.filter((d) => d.departmentId === dept?.departmentId);
      const designation = findByName(designations, r.designation || r.Designation) ?? deptDesignations[0] ?? designations[0];
      const role = findByName(roles, r.role || r.Role) ?? roles[0];
      const jobCategory = jobCategories[0];
      const shift = findByName(shifts, r.shift || r.Shift) ?? shifts[0];
      const employmentTypeRaw = (r.employmentType || r["Employment Type"] || "full_time").toLowerCase().replace(/\s+/g, "_");
      const employmentType = (EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === employmentTypeRaw)?.value ?? "full_time") as Professional["employmentType"];

      try {
        await professionalsApi.create({
          professionalCode: r.professionalCode || r["Professional Code"] || `EMP-${Date.now().toString().slice(-6)}${i}`,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password: `Temp${Math.random().toString(36).slice(2, 8)}!`,
          phone: r.phone || r.Phone || "",
          profileImageUrl: "",
          dateOfBirth: r.dateOfBirth || "2000-01-01",
          gender: "other",
          address: r.address || "",
          joiningDate: r.joiningDate || new Date().toISOString().slice(0, 10),
          employmentType,
          salary: Number(r.salary) || 0,
          overtimeAllowed: false,
          roleId: role?.roleId ?? "",
          departmentId: dept?.departmentId ?? "",
          designationId: designation?.designationId ?? "",
          jobCategoryId: jobCategory?.jobCategoryId ?? "",
          shiftId: shift?.shiftId ?? "",
          managerId: "",
          status: "active",
        });
        success++;
      } catch {
        failed++;
      }
    }
    load();
    return { success, failed };
  };

  // ---- grid columns --------------------------------------------------------
  const columns: GridColumn<Professional>[] = [
    {
      key: "professional",
      label: "Professional",
      locked: true,
      width: 240,
      minWidth: 190,
      sortAccessor: (e) => `${e.firstName} ${e.lastName}`,
      render: (e) => (
        <div className="flex items-center gap-3">
          <EmployeeAvatar
            firstName={e.firstName}
            lastName={e.lastName}
            photo={e.profileImageUrl}
            thumb={e.profileImageThumbUrl}
            size={36}
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">
              {e.firstName} {e.lastName}
            </p>
            <p className="truncate text-xs text-gray-400">{e.professionalCode}</p>
          </div>
        </div>
      ),
    },
    { key: "department", label: "Department", width: 160, minWidth: 120, sortAccessor: (e) => e.departmentName, render: (e) => e.departmentName },
    { key: "designation", label: "Designation", width: 170, minWidth: 130, sortAccessor: (e) => e.designationName, render: (e) => e.designationName },
    { key: "role", label: "Role", width: 150, minWidth: 110, hiddenByDefault: true, sortAccessor: (e) => e.roleName, render: (e) => e.roleName },
    { key: "manager", label: "Manager", width: 170, minWidth: 130, hiddenByDefault: true, sortAccessor: (e) => e.managerName, render: (e) => e.managerName },
    { key: "shift", label: "Shift", width: 150, minWidth: 110, hiddenByDefault: true, sortAccessor: (e) => e.shiftName, render: (e) => e.shiftName },
    {
      key: "employmentType",
      label: "Employment Type",
      width: 150,
      minWidth: 130,
      sortAccessor: (e) => e.employmentType,
      render: (e) => EMPLOYMENT_TYPE_LABEL[e.employmentType],
    },
    { key: "email", label: "Email", width: 210, minWidth: 160, hiddenByDefault: true, render: (e) => <span className="truncate">{e.email}</span> },
    { key: "phone", label: "Phone", width: 150, minWidth: 120, hiddenByDefault: true, render: (e) => e.phone },
    {
      key: "salary",
      label: "Salary",
      width: 130,
      minWidth: 100,
      align: "right",
      hiddenByDefault: true,
      sortAccessor: (e) => e.salary,
      render: (e) => e.salary.toLocaleString(),
    },
    {
      key: "joiningDate",
      label: "Joined",
      width: 130,
      minWidth: 110,
      sortAccessor: (e) => e.joiningDate,
      render: (e) => formatDisplayDate(e.joiningDate),
    },
    { key: "status", label: "Status", width: 110, minWidth: 100, sortAccessor: (e) => e.status, render: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <DashboardLayout title="Professionals" activeKey="professionals">
      <BackendStatusBanner status={status} />

      <ProfessionalDataGrid
        storageKey="hrms.professionals.grid"
        columns={columns}
        rows={filteredRows}
        rowKey={(e) => e.professionalId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search professionals…"
        emptyIcon={Users}
        emptyTitle="No professionals found"
        emptyDescription="Add your first professional, import a CSV, or adjust your filters."
        pageSizeOptions={[10, 25, 50, 100]}
        onOpenFilters={() => setFilterDrawerOpen(true)}
        activeFilterCount={activeFilterCount}
        filterChips={filterChips}
        onExport={handleExport}
        onImportClick={() => setImportOpen(true)}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        bulkActions={bulkActions}
        addButton={
          <button
            type="button"
            onClick={openCreate}
            className="flex min-h-10 items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <Plus size={16} /> Add Professional
          </button>
        }
        actions={(e) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => navigate(`/professionals/${e.professionalId}`)}
              aria-label={`View ${e.firstName} ${e.lastName}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              onClick={() => openEdit(e)}
              aria-label={`Edit ${e.firstName} ${e.lastName}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setStatusTarget(e)}
              aria-label={e.status === "active" ? `Deactivate ${e.firstName}` : `Activate ${e.firstName}`}
              className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg transition hover:bg-gray-100 ${
                e.status === "active" ? "text-emerald-500 hover:text-emerald-600" : "text-gray-400 hover:text-gray-700"
              }`}
            >
              <Power size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(e)}
              aria-label={`Delete ${e.firstName} ${e.lastName}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      />

      <AdvancedFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onApply={setFilters}
        departmentOptions={departments.map((d) => ({ value: d.departmentId, label: d.name }))}
        designationOptions={designations.map((d) => ({ value: d.designationId, label: d.name }))}
        shiftOptions={shifts.map((s) => ({ value: s.shiftId, label: s.name }))}
        roleOptions={roles.map((r) => ({ value: r.roleId, label: r.name }))}
        managerOptions={allProfessionals.map((e) => ({ value: e.professionalId, label: `${e.firstName} ${e.lastName}` }))}
        employmentTypeOptions={[...EMPLOYMENT_TYPE_OPTIONS]}
        statusOptions={STATUS_OPTIONS}
        savedFilters={savedFilters}
        currentSearch={search}
        onSaveCurrent={handleSaveFilterView}
        onApplySaved={handleApplySavedFilter}
        onDeleteSaved={handleDeleteSavedFilter}
      />

      <ImportProfessionalsModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />

      <ConfirmDialog
        open={!!statusTarget}
        title={statusTarget?.status === "active" ? `Deactivate ${statusTarget?.firstName}?` : `Activate ${statusTarget?.firstName}?`}
        description={
          statusTarget?.status === "active"
            ? "This professional will lose access and be marked inactive. You can reactivate them anytime."
            : "This professional will regain access and be marked active."
        }
        confirmLabel={statusTarget?.status === "active" ? "Deactivate" : "Activate"}
        tone={statusTarget?.status === "active" ? "danger" : "brand"}
        loading={statusSaving}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.firstName} ${deleteTarget?.lastName}"?`}
        description="This permanently removes the professional record. Consider deactivating instead if they may return. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!bulkDeleteIds}
        title={`Delete ${bulkDeleteIds?.length ?? 0} professional(s)?`}
        description="This permanently removes the selected professional records. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setBulkDeleteIds(null)}
      />
    </DashboardLayout>
  );
}
