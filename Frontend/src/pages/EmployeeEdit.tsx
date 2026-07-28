import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  ChevronRight,
  User,
  MapPinned,
  Briefcase,
  Wallet,
  CircleAlert,
  UserX,
  Loader2,
  ArrowLeft,
  Moon,
  Sun,
} from "lucide-react";
import DashboardLayout from "../components/dashboard/DashboardLayout";
import FormSelect from "../components/employees/FormSelect";
import ConfirmDialog from "../components/ConfirmDialog";
import BackendStatusBanner from "../components/BackendStatusBanner";
import { useBackendStatus } from "../hooks/useBackendStatus";
import { FormField, PrimaryButton } from "../components/FormField";
import { useToast } from "../lib/ToastContext";
import { useAuth } from "../lib/AuthContext";
import { useTheme } from "../lib/ThemeContext";
import { appendActivity } from "../lib/employeeActivityLog";
import { employeesApi, type Employee, type EmployeePayload, type EmployeeStatus } from "../lib/employeeApi";
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
import { GENDER_OPTIONS, EMPLOYMENT_TYPE_OPTIONS, EMAIL_RE } from "../lib/employeeFormOptions";

type FormState = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
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

function toFormState(emp: Employee): FormState {
  return {
    employeeCode: emp.employeeCode,
    firstName: emp.firstName,
    lastName: emp.lastName,
    email: emp.email,
    phone: emp.phone,
    dateOfBirth: emp.dateOfBirth,
    gender: emp.gender,
    address: emp.address,
    joiningDate: emp.joiningDate,
    employmentType: emp.employmentType,
    salary: String(emp.salary),
    overtimeAllowed: emp.overtimeAllowed,
    roleId: emp.roleId,
    departmentId: emp.departmentId,
    designationId: emp.designationId,
    jobCategoryId: emp.jobCategoryId,
    shiftId: emp.shiftId,
    managerId: emp.managerId,
    status: emp.status,
  };
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof User;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand-dark dark:bg-brand/10 dark:text-brand">
          <Icon size={16} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {description && <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>}
        </div>
      </div>
      <div className="px-5 pt-5">{children}</div>
    </div>
  );
}

export default function EmployeeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const status = useBackendStatus();
  const toast = useToast();
  const { user } = useAuth();
  const { isDark, toggleTheme, themeClass } = useTheme();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loadingEmployee, setLoadingEmployee] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  const [form, setForm] = useState<FormState | null>(null);
  const initialFormRef = useRef<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Guards navigating away (breadcrumb / Cancel) while there are unsaved
  // edits — mirrors the "discard changes?" pattern from Odoo/SAP forms.
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoadingEmployee(true);
    setNotFound(false);
    employeesApi
      .getById(id)
      .then((emp) => {
        setEmployee(emp);
        const initial = toFormState(emp);
        setForm(initial);
        initialFormRef.current = initial;
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoadingEmployee(false));
  }, [id]);

  useEffect(() => {
    employeesApi.list({ pageSize: 1000 }).then((res) => setAllEmployees(res.data)).catch(() => undefined);
    departmentsApi.listAll().then((res) => setDepartments(res.data)).catch(() => undefined);
    designationsApi.list({ pageSize: 1000 }).then((res) => setDesignations(res.data)).catch(() => undefined);
    jobCategoriesApi.list({ pageSize: 1000 }).then((res) => setJobCategories(res.data)).catch(() => undefined);
    shiftsApi.list({ pageSize: 1000 }).then((res) => setShifts(res.data)).catch(() => undefined);
    rolesApi.list({ pageSize: 1000 }).then((res) => setRoles(res.data)).catch(() => undefined);
  }, []);

  const isDirty = useMemo(() => {
    if (!form || !initialFormRef.current) return false;
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  }, [form]);

  // Warn on tab close / refresh while there are unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const designationsForDepartment = useMemo(
    () => designations.filter((d) => d.departmentId === form?.departmentId),
    [designations, form?.departmentId],
  );

  const managerOptions = useMemo(
    () => allEmployees.filter((e) => e.employeeId !== employee?.employeeId).map((e) => ({ value: e.employeeId, label: `${e.firstName} ${e.lastName}` })),
    [allEmployees, employee],
  );

  const guardedNavigate = (action: () => void) => {
    if (isDirty) {
      pendingNavigation.current = action;
      setDiscardConfirmOpen(true);
    } else {
      action();
    }
  };

  const confirmDiscard = () => {
    setDiscardConfirmOpen(false);
    pendingNavigation.current?.();
    pendingNavigation.current = null;
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form || !employee) return;

    if (!form.firstName.trim() || !form.lastName.trim()) return setFormError("First and last name are required.");
    if (!EMAIL_RE.test(form.email.trim())) return setFormError("Enter a valid email address.");
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

    const payload: EmployeePayload = {
      employeeCode: form.employeeCode.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      profileImageUrl: employee.profileImageUrl,
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
      await employeesApi.update(employee.employeeId, payload);
      const actor = user ? `${user.firstName} ${user.lastName}`.trim() : "Admin";
      appendActivity(employee.employeeId, "updated", "Profile details were updated.", actor);
      toast.showSuccess("Employee updated.");
      initialFormRef.current = form;
      navigate("/employees");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const backToList = () => guardedNavigate(() => navigate("/employees"));

  return (
    <DashboardLayout title="Edit Employee" activeKey="employees">
      <BackendStatusBanner status={status} />

      <div className={`${themeClass} rounded-3xl dark:bg-gray-950 dark:p-3 sm:dark:p-4 -mx-0.5`}>
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
        <button type="button" onClick={backToList} className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:text-brand-dark hover:underline">
          Employees
        </button>
        <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
        <span className="max-w-[160px] truncate text-gray-500 dark:text-gray-400 xs:max-w-[240px]">
          {employee ? `${employee.firstName} ${employee.lastName}` : "…"}
        </span>
        <ChevronRight size={14} className="text-gray-300 dark:text-gray-600" />
        <span className="font-medium text-gray-900 dark:text-gray-100">Edit</span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={isDark}
          aria-label="Toggle dark mode"
          className="ml-auto flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {isDark ? <Sun size={13} /> : <Moon size={13} />} {isDark ? "Light" : "Dark"}
        </button>
      </nav>

      {loadingEmployee ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-20 text-center shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
          <Loader2 size={22} className="animate-spin text-brand-dark" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading employee…</p>
        </div>
      ) : notFound || !employee || !form ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-white px-6 py-20 text-center shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400">
            <UserX size={24} />
          </span>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Employee not found</p>
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">This employee record may have been deleted or the link is out of date.</p>
          <Link
            to="/employees"
            className="mt-2 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand to-brand-dark px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:brightness-95"
          >
            <ArrowLeft size={15} /> Back to Employees
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 pb-4">
          {/* Profile snapshot header */}
          <div className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 dark:bg-gray-900 dark:ring-gray-800 sm:flex-row sm:items-center">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-light text-xl font-semibold text-brand-dark dark:bg-brand/10 dark:text-brand">
              {employee.firstName[0]}
              {employee.lastName[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                {employee.firstName} {employee.lastName}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500">
                {employee.employeeCode} · {employee.designationName} · {employee.departmentName}
              </p>
            </div>
            {isDirty && (
              <span className="flex shrink-0 items-center gap-1.5 self-start rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 sm:self-center">
                <CircleAlert size={13} /> Unsaved changes
              </span>
            )}
          </div>

          <SectionCard icon={User} title="Personal Information" description="Legal name and personal details on file.">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="First Name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
              <FormField label="Last Name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required />
              <FormField label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} required />
              <FormSelect label="Gender" value={form.gender} onChange={(v) => set("gender", v as FormState["gender"])} options={[...GENDER_OPTIONS]} />
            </div>
          </SectionCard>

          <SectionCard icon={MapPinned} title="Contact & Address" description="How to reach this employee.">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              <FormField label="Phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
            </div>
            <label className="mb-5 block">
              <span className="mb-2 block text-[15px] font-medium text-gray-900 dark:text-gray-100">Address</span>
              <textarea
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-brand/60 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </label>
          </SectionCard>

          <SectionCard icon={Briefcase} title="Employment Details" description="Role, reporting line, and work assignment.">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Employee Code" value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} required />
              <FormField label="Joining Date" type="date" value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} required />
              <FormSelect label="Role" value={form.roleId} onChange={(v) => set("roleId", v)} options={roles.map((r) => ({ value: r.roleId, label: r.name }))} placeholder="Select role" />
              <FormSelect
                label="Department"
                value={form.departmentId}
                onChange={(v) => setForm((f) => (f ? { ...f, departmentId: v, designationId: "" } : f))}
                options={departments.map((d) => ({ value: d.departmentId, label: d.name }))}
                placeholder="Select department"
              />
              <FormSelect
                label="Designation"
                value={form.designationId}
                onChange={(v) => set("designationId", v)}
                options={designationsForDepartment.map((d) => ({ value: d.designationId, label: d.name }))}
                placeholder={form.departmentId ? "Select designation" : "Select a department first"}
              />
              <FormSelect
                label="Job Category"
                value={form.jobCategoryId}
                onChange={(v) => set("jobCategoryId", v)}
                options={jobCategories.map((c) => ({ value: c.jobCategoryId, label: c.name }))}
                placeholder="Select job category"
              />
              <FormSelect
                label="Shift"
                value={form.shiftId}
                onChange={(v) => set("shiftId", v)}
                options={shifts.map((s) => ({ value: s.shiftId, label: `${s.name} (${s.startTime}–${s.endTime})` }))}
                placeholder="Select shift"
              />
              <FormSelect
                label="Employment Type"
                value={form.employmentType}
                onChange={(v) => set("employmentType", v as FormState["employmentType"])}
                options={[...EMPLOYMENT_TYPE_OPTIONS]}
              />
              <FormSelect label="Reporting Manager" value={form.managerId} onChange={(v) => set("managerId", v)} options={managerOptions} placeholder="No manager" />
              <FormSelect
                label="Status"
                value={form.status}
                onChange={(v) => set("status", v as EmployeeStatus)}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </div>
          </SectionCard>

          <SectionCard icon={Wallet} title="Compensation" description="Salary and overtime eligibility.">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Salary" type="number" min="0" step="1000" value={form.salary} onChange={(e) => set("salary", e.target.value)} required />
            </div>
            <label className="mb-5 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
              <input
                type="checkbox"
                checked={form.overtimeAllowed}
                onChange={(e) => set("overtimeAllowed", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60 dark:border-gray-600 dark:bg-gray-800"
              />
              Overtime Allowed
            </label>
          </SectionCard>

          {formError && (
            <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
              <CircleAlert size={14} className="shrink-0" /> {formError}
            </p>
          )}

          {/* Sticky Save / Cancel */}
          <div className="sticky bottom-4 z-20 flex flex-col items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700 sm:flex-row">
            <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
              {isDirty ? (
                <>
                  <CircleAlert size={14} className="text-amber-500" /> You have unsaved changes
                </>
              ) : (
                "No changes to save"
              )}
            </span>
            <div className="flex w-full gap-2.5 sm:w-auto">
              <button
                type="button"
                onClick={backToList}
                className="min-h-11 flex-1 rounded-full border border-gray-200 px-6 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 sm:flex-none"
              >
                Cancel
              </button>
              <div className="flex-1 sm:flex-none sm:min-w-[160px]">
                <PrimaryButton type="submit" loading={saving} disabled={!isDirty}>
                  Save Changes
                </PrimaryButton>
              </div>
            </div>
          </div>
        </form>
      )}
      </div>

      <ConfirmDialog
        open={discardConfirmOpen}
        title="Discard unsaved changes?"
        description="You have unsaved edits to this employee's record. Leaving now will discard them."
        confirmLabel="Discard Changes"
        tone="danger"
        onConfirm={confirmDiscard}
        onCancel={() => {
          setDiscardConfirmOpen(false);
          pendingNavigation.current = null;
        }}
      />
    </DashboardLayout>
  );
}
