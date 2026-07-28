import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Pencil, Eye, Trash2, Power, CircleCheck, CircleSlash, Moon, Sun, UserCheck, UserMinus } from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import EmployeeDataGrid, { type GridColumn, type FilterChip, type BulkAction } from "../components/employees/EmployeeDataGrid";
import AdvancedFilterDrawer, { EMPTY_FILTERS, type EmployeeFilters, type SavedFilter } from "../components/employees/AdvancedFilterDrawer";
import ImportEmployeesModal, { type ImportRow } from "../components/employees/ImportEmployeesModal";
import EmployeeViewDrawer from "../components/employees/EmployeeViewDrawer";
import DeactivateEmployeeDialog, { type DeactivateSubmission } from "../components/employees/DeactivateEmployeeDialog";
import FormSelect from "../components/employees/FormSelect";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import StatusBadge from "../components/StatusBadge";
import { FormField, PrimaryButton } from "../components/FormField";
import BackendStatusBanner from "../components/BackendStatusBanner";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { useToast } from "../lib/ToastContext";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { toCSV, downloadCSV } from "../lib/csv";
import { formatDisplayDate } from "../lib/formatDate";
import { appendActivity } from "../lib/employeeActivityLog";
import { employeesApi, type Employee, type EmployeeCreatePayload, type EmployeeStatus } from "../lib/employeeApi";
import { GENDER_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, EMPLOYMENT_TYPE_LABEL, STATUS_OPTIONS, EMAIL_RE } from "../lib/employeeFormOptions";
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
} from "../lib/settingsApi";

const SAVED_FILTERS_KEY = "hrms.employees.savedFilters";

type FormState = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other";
  address: string;
  joiningDate: string;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  salary: string;
  overtimeAllowed: boolean;
  roleId: string;
  departmentId: string;
  designationId: string;
  jobCategoryId: string;
  shiftId: string;
  managerId: string;
  status: EmployeeStatus;
};

const EMPTY_FORM: FormState = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phone: "",
  dateOfBirth: "",
  gender: "male",
  address: "",
  joiningDate: "",
  employmentType: "full_time",
  salary: "",
  overtimeAllowed: false,
  roleId: "",
  departmentId: "",
  designationId: "",
  jobCategoryId: "",
  shiftId: "",
  managerId: "",
  status: "active",
};

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

export default function EmployeesPage() {
  const status = useBackendStatus();
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark, toggleTheme, themeClass } = useTheme();

  // The grid does its own client-side search/filter/sort/pagination, so we
  // load the full employee set once and let it work off that — the same
  // "one in-memory source of truth" pattern the mock API itself already
  // uses under the hood.
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<EmployeeFilters>(EMPTY_FILTERS);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>(() => loadSavedFilters());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusTarget, setStatusTarget] = useState<Employee | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    employeesApi
      .list({ pageSize: 1000 })
      .then((res) => setAllEmployees(res.data))
      .catch(() => toast.showError("Couldn't load employees."))
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

  const designationsForDepartment = useMemo(
    () => designations.filter((d) => d.departmentId === form.departmentId),
    [designations, form.departmentId],
  );

  const managerOptions = useMemo(() => allEmployees.map((e) => ({ value: e.employeeId, label: `${e.firstName} ${e.lastName}` })), [allEmployees]);

  // The employee currently shown in the view drawer — derived from the live
  // list (by id) rather than held as its own snapshot, so status changes /
  // edits made elsewhere are reflected immediately without extra plumbing.
  const viewingEmployee = useMemo(() => allEmployees.find((e) => e.employeeId === viewingId) ?? null, [allEmployees, viewingId]);

  // ---- filtering (search + advanced filters), all client-side ----------
  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allEmployees.filter((e) => {
      if (needle) {
        const haystack = [e.firstName, e.lastName, e.employeeCode, e.email, e.phone, e.departmentName, e.designationName].join(" ").toLowerCase();
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
  }, [allEmployees, search, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filterChips: FilterChip[] = useMemo(() => {
    const chips: FilterChip[] = [];
    const clear = (key: keyof EmployeeFilters) => setFilters((f) => ({ ...f, [key]: "" }));
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
      const emp = allEmployees.find((e) => e.employeeId === filters.managerId);
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
  }, [filters, departments, designations, shifts, roles, allEmployees]);

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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  };

  const goToEdit = (emp: Employee) => navigate(`/employees/${emp.employeeId}/edit`);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!form.firstName.trim() || !form.lastName.trim()) return setFormError("First and last name are required.");
    if (!EMAIL_RE.test(form.email.trim())) return setFormError("Enter a valid email address.");
    if (form.password.trim().length < 6) return setFormError("Password must be at least 6 characters.");
    if (!form.phone.trim()) return setFormError("Phone number is required.");
    if (!form.employeeCode.trim()) return setFormError("Employee code is required.");
    if (!form.dateOfBirth) return setFormError("Date of birth is required.");
    if (!form.joiningDate) return setFormError("Joining date is required.");
    if (!form.roleId) return setFormError("Select a role.");
    if (!form.departmentId) return setFormError("Select a department.");
    if (!form.designationId) return setFormError("Select a designation.");
    if (!form.jobCategoryId) return setFormError("Select a job category.");
    if (!form.shiftId) return setFormError("Select a shift.");
    const salaryNum = Number(form.salary);
    if (!form.salary || Number.isNaN(salaryNum) || salaryNum <= 0) return setFormError("Enter a valid salary.");

    const payload: EmployeeCreatePayload = {
      employeeCode: form.employeeCode.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim(),
      profileImageUrl: "",
      dateOfBirth: form.dateOfBirth,
      gender: form.gender,
      address: form.address.trim(),
      joiningDate: form.joiningDate,
      employmentType: form.employmentType,
      salary: salaryNum,
      overtimeAllowed: form.overtimeAllowed,
      roleId: form.roleId,
      departmentId: form.departmentId,
      designationId: form.designationId,
      jobCategoryId: form.jobCategoryId,
      shiftId: form.shiftId,
      managerId: form.managerId,
      status: form.status,
    };

    setSaving(true);
    setFormError(null);
    try {
      const created = await employeesApi.create(payload);
      const actor = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";
      appendActivity(created.employeeId, "created", "Employee record created.", actor);
      toast.showSuccess("Employee added.");
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
      await employeesApi.remove(deleteTarget.employeeId);
      toast.showSuccess("Employee deleted.");
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't delete employee.");
    } finally {
      setDeleting(false);
    }
  };

  // Reactivation is a low-stakes toggle — quick corner ConfirmDialog.
  const handleActivateConfirm = async () => {
    if (!statusTarget) return;
    setStatusSaving(true);
    try {
      await employeesApi.setStatus(statusTarget.employeeId, "active");
      const actor = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";
      appendActivity(statusTarget.employeeId, "status", "Employee was activated.", actor);
      toast.showSuccess("Employee activated.", `${statusTarget.firstName} ${statusTarget.lastName} can access the system again.`);
      setStatusTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  // Deactivation carries more weight (loses access, audit trail, optional
  // employee notice) so it runs through the richer DeactivateEmployeeDialog
  // and — since it's easy to trigger by mistake from a dense grid — offers
  // an inline Undo right on the success toast instead of a second dialog.
  const undoDeactivate = async (target: Employee) => {
    try {
      await employeesApi.setStatus(target.employeeId, "active");
      const actor = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";
      appendActivity(target.employeeId, "status", "Deactivation undone — employee reactivated.", actor);
      toast.showSuccess("Deactivation undone.", `${target.firstName} ${target.lastName} is active again.`);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't undo — please reactivate manually.");
    }
  };

  const handleDeactivateConfirm = async ({ reason, reasonNote, notifyEmployee }: DeactivateSubmission) => {
    if (!statusTarget) return;
    const target = statusTarget;
    setStatusSaving(true);
    try {
      await employeesApi.setStatus(target.employeeId, "inactive");
      const actor = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";
      const detail = reasonNote ? `${reason} — ${reasonNote}` : reason;
      appendActivity(
        target.employeeId,
        "status",
        `Employee was deactivated. Reason: ${detail}. Employee ${notifyEmployee ? "was" : "was not"} notified by email.`,
        actor,
      );
      toast.showSuccess(`${target.firstName} ${target.lastName} deactivated.`, notifyEmployee ? "They've been notified by email." : undefined, {
        action: { label: "Undo", onClick: () => undoDeactivate(target) },
      });
      setStatusTarget(null);
      load();
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : "Couldn't update status.");
    } finally {
      setStatusSaving(false);
    }
  };

  // ---- bulk actions ------------------------------------------------------
  const runBulkStatus = async (ids: string[], next: EmployeeStatus) => {
    const results = await Promise.allSettled(ids.map((id) => employeesApi.setStatus(id, next)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.showSuccess(
        `${ids.length} employee(s) ${next === "active" ? "activated" : "deactivated"}.`,
        undefined,
        next === "inactive"
          ? { action: { label: "Undo", onClick: () => Promise.allSettled(ids.map((id) => employeesApi.setStatus(id, "active"))).then(load) } }
          : undefined,
      );
    } else toast.showWarning(`${ids.length - failed} of ${ids.length} updated`, `${failed} row(s) failed to update.`);
    setSelectedIds(new Set());
    load();
  };

  const handleBulkDeleteConfirm = async () => {
    if (!bulkDeleteIds) return;
    setBulkDeleting(true);
    try {
      const results = await Promise.allSettled(bulkDeleteIds.map((id) => employeesApi.remove(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed === 0) toast.showSuccess(`${bulkDeleteIds.length} employee(s) deleted.`);
      else toast.showWarning(`${bulkDeleteIds.length - failed} of ${bulkDeleteIds.length} deleted`, `${failed} row(s) failed to delete.`);
      setSelectedIds(new Set());
      setBulkDeleteIds(null);
      load();
    } finally {
      setBulkDeleting(false);
    }
  };

  const bulkActions: BulkAction<Employee>[] = [
    { key: "activate", label: "Activate", icon: CircleCheck, onClick: (ids) => runBulkStatus(ids, "active") },
    { key: "deactivate", label: "Deactivate", icon: CircleSlash, onClick: (ids) => runBulkStatus(ids, "inactive") },
    { key: "delete", label: "Delete", icon: Trash2, tone: "danger", onClick: (ids) => setBulkDeleteIds(ids) },
  ];

  // ---- export / import ---------------------------------------------------
  const handleExport = (rowsToExport: Employee[]) => {
    if (rowsToExport.length === 0) return toast.showWarning("Nothing to export.");
    const headers = [
      "employeeCode",
      "firstName",
      "lastName",
      "email",
      "phone",
      "department",
      "designation",
      "role",
      "manager",
      "shift",
      "employmentType",
      "salary",
      "joiningDate",
      "status",
    ];
    const csv = toCSV(
      headers,
      rowsToExport.map((e) => ({
        employeeCode: e.employeeCode,
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
        joiningDate: e.joiningDate,
        status: e.status,
      })),
    );
    downloadCSV(`employees-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.showSuccess(`Exported ${rowsToExport.length} employee(s).`);
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
      const employmentType = (EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === employmentTypeRaw)?.value ?? "full_time") as FormState["employmentType"];

      try {
        const created = await employeesApi.create({
          employeeCode: r.employeeCode || r["Employee Code"] || `EMP-${Date.now().toString().slice(-6)}${i}`,
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
        appendActivity(created.employeeId, "created", "Employee record created via CSV import.", user ? `${user.firstName} ${user.lastName}`.trim() : "Admin");
        success++;
      } catch {
        failed++;
      }
    }
    load();
    return { success, failed };
  };

  // ---- grid columns --------------------------------------------------------
  const columns: GridColumn<Employee>[] = [
    {
      key: "employee",
      label: "Employee",
      locked: true,
      width: 240,
      minWidth: 190,
      sortAccessor: (e) => `${e.firstName} ${e.lastName}`,
      render: (e) => (
        <button
          type="button"
          onClick={() => setViewingId(e.employeeId)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand-dark">
            {e.firstName[0]}
            {e.lastName[0]}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900 hover:text-brand-dark hover:underline">
              {e.firstName} {e.lastName}
            </p>
            <p className="truncate text-xs text-gray-400">{e.employeeCode}</p>
          </div>
        </button>
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

  const activeCount = allEmployees.filter((e) => e.status === "active").length;
  const inactiveCount = allEmployees.length - activeCount;

  return (
    <DashboardLayout title="Employees" activeKey="employees">
      <BackendStatusBanner status={status} />

      <div className={`${themeClass} rounded-3xl dark:bg-gray-950 dark:p-3 sm:dark:p-4 -mx-0.5`}>
        {/* Summary strip + module-level dark mode toggle */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-light text-brand-dark dark:bg-brand/10 dark:text-brand">
              <Users size={16} />
            </span>
            <p className="mt-2.5 text-xl font-semibold text-gray-900 dark:text-gray-100">{allEmployees.length}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Total Employees</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <UserCheck size={16} />
            </span>
            <p className="mt-2.5 text-xl font-semibold text-gray-900 dark:text-gray-100">{activeCount}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Active</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
              <UserMinus size={16} />
            </span>
            <p className="mt-2.5 text-xl font-semibold text-gray-900 dark:text-gray-100">{inactiveCount}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Inactive</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={isDark}
            className="flex flex-col items-start justify-between rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-gray-100 transition hover:ring-brand/40 dark:bg-gray-900 dark:ring-gray-800 dark:hover:ring-brand/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </span>
            <span className="mt-2.5 text-sm font-semibold text-gray-900 dark:text-gray-100">{isDark ? "Light mode" : "Dark mode"}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Employee module</span>
          </button>
        </div>

        <EmployeeDataGrid
        storageKey="hrms.employees.grid"
        columns={columns}
        rows={filteredRows}
        rowKey={(e) => e.employeeId}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search employees…"
        emptyIcon={Users}
        emptyTitle="No employees found"
        emptyDescription="Add your first employee, import a CSV, or adjust your filters."
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
            <Plus size={16} /> Add Employee
          </button>
        }
        actions={(e) => (
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setViewingId(e.employeeId)}
              aria-label={`View ${e.firstName} ${e.lastName}`}
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              onClick={() => goToEdit(e)}
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
      </div>

      <AdvancedFilterDrawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        filters={filters}
        onApply={setFilters}
        departmentOptions={departments.map((d) => ({ value: d.departmentId, label: d.name }))}
        designationOptions={designations.map((d) => ({ value: d.designationId, label: d.name }))}
        shiftOptions={shifts.map((s) => ({ value: s.shiftId, label: s.name }))}
        roleOptions={roles.map((r) => ({ value: r.roleId, label: r.name }))}
        managerOptions={allEmployees.map((e) => ({ value: e.employeeId, label: `${e.firstName} ${e.lastName}` }))}
        employmentTypeOptions={[...EMPLOYMENT_TYPE_OPTIONS]}
        statusOptions={STATUS_OPTIONS}
        savedFilters={savedFilters}
        currentSearch={search}
        onSaveCurrent={handleSaveFilterView}
        onApplySaved={handleApplySavedFilter}
        onDeleteSaved={handleDeleteSavedFilter}
      />

      <ImportEmployeesModal open={importOpen} onClose={() => setImportOpen(false)} onImport={handleImport} />

      <EmployeeViewDrawer
        employee={viewingEmployee}
        open={!!viewingId}
        onClose={() => setViewingId(null)}
        onEdit={goToEdit}
        onRequestStatusChange={(emp) => setStatusTarget(emp)}
      />

      {/* Add Employee */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Employee" description="Create a new employee record." maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Personal Information</p>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="First Name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} required />
            <FormField label="Last Name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} required />
            <FormField label="Email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            <FormField
              label="Password"
              type="password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              required
            />
            <FormField label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} required />
            <FormField label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} required />
            <FormSelect label="Gender" value={form.gender} onChange={(v) => setForm((f) => ({ ...f, gender: v as FormState["gender"] }))} options={[...GENDER_OPTIONS]} />
          </div>
          <label className="mb-5 block">
            <span className="mb-2 block text-[15px] font-medium text-gray-900">Address</span>
            <textarea
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              rows={2}
              className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60"
            />
          </label>

          <p className="mb-3 mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Employment Details</p>
          <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
            <FormField label="Employee Code" placeholder="e.g. EMP-1011" value={form.employeeCode} onChange={(e) => setForm((f) => ({ ...f, employeeCode: e.target.value }))} required />
            <FormField label="Joining Date" type="date" value={form.joiningDate} onChange={(e) => setForm((f) => ({ ...f, joiningDate: e.target.value }))} required />
            <FormSelect
              label="Role"
              value={form.roleId}
              onChange={(v) => setForm((f) => ({ ...f, roleId: v }))}
              options={roles.map((r) => ({ value: r.roleId, label: r.name }))}
              placeholder="Select role"
            />
            <FormSelect
              label="Department"
              value={form.departmentId}
              onChange={(v) => setForm((f) => ({ ...f, departmentId: v, designationId: "" }))}
              options={departments.map((d) => ({ value: d.departmentId, label: d.name }))}
              placeholder="Select department"
            />
            <FormSelect
              label="Designation"
              value={form.designationId}
              onChange={(v) => setForm((f) => ({ ...f, designationId: v }))}
              options={designationsForDepartment.map((d) => ({ value: d.designationId, label: d.name }))}
              placeholder={form.departmentId ? "Select designation" : "Select a department first"}
            />
            <FormSelect
              label="Job Category"
              value={form.jobCategoryId}
              onChange={(v) => setForm((f) => ({ ...f, jobCategoryId: v }))}
              options={jobCategories.map((c) => ({ value: c.jobCategoryId, label: c.name }))}
              placeholder="Select job category"
            />
            <FormSelect
              label="Shift"
              value={form.shiftId}
              onChange={(v) => setForm((f) => ({ ...f, shiftId: v }))}
              options={shifts.map((s) => ({ value: s.shiftId, label: `${s.name} (${s.startTime}–${s.endTime})` }))}
              placeholder="Select shift"
            />
            <FormSelect
              label="Employment Type"
              value={form.employmentType}
              onChange={(v) => setForm((f) => ({ ...f, employmentType: v as FormState["employmentType"] }))}
              options={[...EMPLOYMENT_TYPE_OPTIONS]}
            />
            <FormSelect
              label="Reporting Manager"
              value={form.managerId}
              onChange={(v) => setForm((f) => ({ ...f, managerId: v }))}
              options={managerOptions}
              placeholder="No manager"
            />
            <FormField label="Salary" type="number" min="0" step="1000" value={form.salary} onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))} required />
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={form.overtimeAllowed}
                onChange={(e) => setForm((f) => ({ ...f, overtimeAllowed: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
              />
              Overtime Allowed
            </label>
          </div>

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
                Create Employee
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!statusTarget && statusTarget.status !== "active"}
        title={`Activate ${statusTarget?.firstName}?`}
        description="This employee will regain access and be marked active."
        confirmLabel="Activate"
        tone="brand"
        loading={statusSaving}
        onConfirm={handleActivateConfirm}
        onCancel={() => setStatusTarget(null)}
      />

      <DeactivateEmployeeDialog
        open={!!statusTarget && statusTarget.status === "active"}
        employee={statusTarget}
        loading={statusSaving}
        onConfirm={handleDeactivateConfirm}
        onCancel={() => setStatusTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete "${deleteTarget?.firstName} ${deleteTarget?.lastName}"?`}
        description="This permanently removes the employee record. Consider deactivating instead if they may return. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!bulkDeleteIds}
        title={`Delete ${bulkDeleteIds?.length ?? 0} employee(s)?`}
        description="This permanently removes the selected employee records. This action cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={bulkDeleting}
        onConfirm={handleBulkDeleteConfirm}
        onCancel={() => setBulkDeleteIds(null)}
      />
    </DashboardLayout>
  );
}
