import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  User,
  Briefcase,
  Phone as PhoneIcon,
  MapPin,
  FileUp,
  ShieldAlert,
  Wallet,
  KeyRound,
  Camera,
  Trash2,
  Paperclip,
  AlertCircle,
  Save,
  X,
} from "lucide-react";
import { FormField, PrimaryButton } from "@/components/forms/FormField";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import StatusBadge from "@/components/common/StatusBadge";
import { useToast } from "@/app/providers/ToastContext";
import { employeesApi, type Employee, type EmployeeCreatePayload, type EmployeePayload } from "@/modules/employees/api/employeeApi";
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

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
] as const;

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full-Time" },
  { value: "part_time", label: "Part-Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type UiForm = {
  // Personal Information
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: "male" | "female" | "other";
  profileImageUrl: string;
  // Contact
  email: string;
  phone: string;
  password: string;
  // Address
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  // Employment Details
  employeeCode: string;
  joiningDate: string;
  employmentType: "full_time" | "part_time" | "contract" | "intern";
  departmentId: string;
  designationId: string;
  jobCategoryId: string;
  shiftId: string;
  managerId: string;
  // Payroll
  salary: string;
  overtimeAllowed: boolean;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  // Emergency Contact (UI-only — no matching backend field yet)
  emergencyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  // System Access
  roleId: string;
};

const EMPTY_FORM: UiForm = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "male",
  profileImageUrl: "",
  email: "",
  phone: "",
  password: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  employeeCode: "",
  joiningDate: "",
  employmentType: "full_time",
  departmentId: "",
  designationId: "",
  jobCategoryId: "",
  shiftId: "",
  managerId: "",
  salary: "",
  overtimeAllowed: false,
  bankName: "",
  accountNumber: "",
  ifsc: "",
  emergencyName: "",
  emergencyRelationship: "",
  emergencyPhone: "",
  roleId: "",
};

type DraftDoc = { id: string; name: string; sizeLabel: string };

// Splits the flat `address` string the backend stores back into the
// richer address sub-fields this form exposes, best-effort (the API only
// ever gives us one string back, so this is just a friendlier starting
// point — not a guaranteed round trip).
function splitAddress(address: string): Pick<UiForm, "addressLine1" | "city" | "state" | "postalCode" | "country"> {
  const parts = address.split(",").map((p) => p.trim());
  return {
    addressLine1: parts[0] ?? "",
    city: parts[1] ?? "",
    state: parts[2] ?? "",
    postalCode: parts[3] ?? "",
    country: parts[4] ?? "",
  };
}

function joinAddress(f: UiForm): string {
  return [f.addressLine1, f.city, f.state, f.postalCode, f.country].filter((p) => p.trim()).join(", ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SECTIONS = [
  { id: "personal", label: "Personal Information", icon: User },
  { id: "contact", label: "Contact", icon: PhoneIcon },
  { id: "address", label: "Address", icon: MapPin },
  { id: "employment", label: "Employment Details", icon: Briefcase },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "documents", label: "Documents", icon: FileUp },
  { id: "emergency", label: "Emergency Contact", icon: ShieldAlert },
  { id: "system", label: "System Access", icon: KeyRound },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

// Which section a given field lives in, so a validation error can jump the
// user straight to the right place instead of leaving them to hunt.
const FIELD_SECTION: Record<string, SectionId> = {
  firstName: "personal",
  lastName: "personal",
  dateOfBirth: "personal",
  email: "contact",
  phone: "contact",
  password: "contact",
  employeeCode: "employment",
  joiningDate: "employment",
  departmentId: "employment",
  designationId: "employment",
  jobCategoryId: "employment",
  shiftId: "employment",
  salary: "payroll",
  roleId: "system",
};

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  error,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="mb-5 block">
      <span className="mb-2 block text-[15px] font-medium text-gray-900">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg bg-gray-100 px-4 py-3.5 text-sm text-gray-800 outline-none focus:ring-2 ${
          error ? "ring-2 ring-rose-400" : "focus:ring-brand/60"
        }`}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error ? <span className="mt-1.5 block text-xs text-rose-500">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-gray-400">{hint}</span> : null}
    </label>
  );
}

function FieldWithError({
  label,
  error,
  ...rest
}: React.ComponentProps<typeof FormField> & { error?: string }) {
  return (
    <div>
      <FormField label={label} {...rest} />
      {error && <p className="-mt-4 mb-5 text-xs text-rose-500">{error}</p>}
    </div>
  );
}

function SectionCard({
  id,
  title,
  description,
  icon: Icon,
  children,
  sectionRef,
}: {
  id: SectionId;
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
  sectionRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <section
      id={`section-${id}`}
      ref={sectionRef}
      className="scroll-mt-24 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-100 sm:p-6"
    >
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand-dark">
          <Icon size={18} />
        </span>
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

type Props = {
  mode: "create" | "edit";
  employee?: Employee | null;
  onCancel: () => void;
  onSaved: () => void;
};

export default function EmployeeForm({ mode, employee, onCancel, onSaved }: Props) {
  const toast = useToast();
  const draftKey = mode === "create" ? "hrms.employees.draft.create" : `hrms.employees.draft.edit.${employee?.employeeId ?? ""}`;

  const [form, setForm] = useState<UiForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState<SectionId>("personal");
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [restoreBannerVisible, setRestoreBannerVisible] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<UiForm | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [documents, setDocuments] = useState<DraftDoc[]>([]);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [jobCategories, setJobCategories] = useState<JobCategory[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [refDataLoading, setRefDataLoading] = useState(true);

  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  // Seed the form from the employee being edited (or leave it empty for
  // create), then separately check for a saved draft so the user can
  // choose to restore it instead of losing in-progress work.
  useEffect(() => {
    if (mode === "edit" && employee) {
      setForm({
        firstName: employee.firstName,
        lastName: employee.lastName,
        dateOfBirth: employee.dateOfBirth,
        gender: employee.gender,
        profileImageUrl: employee.profileImageUrl,
        email: employee.email,
        phone: employee.phone,
        password: "",
        ...splitAddress(employee.address),
        employeeCode: employee.employeeCode,
        joiningDate: employee.joiningDate,
        employmentType: employee.employmentType,
        departmentId: employee.departmentId,
        designationId: employee.designationId,
        jobCategoryId: employee.jobCategoryId,
        shiftId: employee.shiftId,
        managerId: employee.managerId,
        salary: String(employee.salary || ""),
        overtimeAllowed: employee.overtimeAllowed,
        bankName: "",
        accountNumber: "",
        ifsc: "",
        emergencyName: "",
        emergencyRelationship: "",
        emergencyPhone: "",
        roleId: employee.roleId,
      });
    }

    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        setPendingDraft(JSON.parse(raw));
        setRestoreBannerVisible(true);
      }
    } catch {
      // ignore corrupt/unavailable draft storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, employee?.employeeId]);

  // Reference data for the dropdowns.
  useEffect(() => {
    setRefDataLoading(true);
    Promise.allSettled([
      departmentsApi.listAll().then((res) => setDepartments(res.data)),
      designationsApi.list({ pageSize: 1000 }).then((res) => setDesignations(res.data)),
      jobCategoriesApi.list({ pageSize: 1000 }).then((res) => setJobCategories(res.data)),
      shiftsApi.list({ pageSize: 1000 }).then((res) => setShifts(res.data)),
      rolesApi.list({ pageSize: 1000 }).then((res) => setRoles(res.data)),
      employeesApi.list({ pageSize: 1000 }).then((res) => setAllEmployees(res.data)),
    ]).finally(() => setRefDataLoading(false));
  }, []);

  const designationsForDepartment = useMemo(
    () => designations.filter((d) => d.departmentId === form.departmentId),
    [designations, form.departmentId],
  );

  const managerOptions = useMemo(
    () =>
      allEmployees
        .filter((e) => e.employeeId !== employee?.employeeId)
        .map((e) => ({ value: e.employeeId, label: `${e.firstName} ${e.lastName}` })),
    [allEmployees, employee],
  );

  const update = <K extends keyof UiForm>(key: K, value: UiForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: "" }));
  };

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "First name is required.";
    if (!form.lastName.trim()) e.lastName = "Last name is required.";
    if (!form.dateOfBirth) e.dateOfBirth = "Date of birth is required.";
    if (!EMAIL_RE.test(form.email.trim())) e.email = "Enter a valid email address.";
    if (!form.phone.trim()) e.phone = "Phone number is required.";
    if (mode === "create" && form.password.trim().length < 6) e.password = "Password must be at least 6 characters.";
    if (!form.employeeCode.trim()) e.employeeCode = "Employee code is required.";
    if (!form.joiningDate) e.joiningDate = "Joining date is required.";
    if (!form.departmentId) e.departmentId = "Select a department.";
    if (!form.designationId) e.designationId = "Select a designation.";
    if (!form.jobCategoryId) e.jobCategoryId = "Select a job category.";
    if (!form.shiftId) e.shiftId = "Select a shift.";
    if (!form.roleId) e.roleId = "Select a role.";
    const salaryNum = Number(form.salary);
    if (!form.salary || Number.isNaN(salaryNum) || salaryNum <= 0) e.salary = "Enter a valid salary.";
    return e;
  };

  const buildPayload = (): EmployeeCreatePayload | EmployeePayload => ({
    employeeCode: form.employeeCode.trim(),
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    email: form.email.trim(),
    ...(mode === "create" ? { password: form.password } : {}),
    phone: form.phone.trim(),
    profileImageUrl: form.profileImageUrl,
    dateOfBirth: form.dateOfBirth,
    gender: form.gender,
    address: joinAddress(form),
    joiningDate: form.joiningDate,
    employmentType: form.employmentType,
    salary: Number(form.salary) || 0,
    overtimeAllowed: form.overtimeAllowed,
    roleId: form.roleId,
    departmentId: form.departmentId,
    designationId: form.designationId,
    jobCategoryId: form.jobCategoryId,
    shiftId: form.shiftId,
    managerId: form.managerId,
    status: employee?.status ?? "active",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    setSubmitError(null);

    const firstErrorKey = Object.keys(validationErrors)[0];
    if (firstErrorKey) {
      const section = FIELD_SECTION[firstErrorKey];
      if (section) scrollToSection(section);
      return;
    }

    setSaving(true);
    try {
      if (mode === "edit" && employee) {
        await employeesApi.update(employee.employeeId, buildPayload() as EmployeePayload);
        toast.showSuccess("Employee updated.", `${form.firstName} ${form.lastName}'s record has been saved.`);
      } else {
        await employeesApi.create(buildPayload() as EmployeeCreatePayload);
        toast.showSuccess("Employee added.", `${form.firstName} ${form.lastName} has been added to your organization.`);
      }
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = () => {
    setSavingDraft(true);
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
      toast.showSuccess("Draft saved.", "You can safely leave this page — your progress is stored on this device.");
      setDirty(false);
    } catch {
      toast.showError("Couldn't save draft.", "Your browser's storage may be full or unavailable.");
    } finally {
      setSavingDraft(false);
    }
  };

  const handleRestoreDraft = () => {
    if (pendingDraft) {
      setForm(pendingDraft);
      setDirty(true);
    }
    setRestoreBannerVisible(false);
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setRestoreBannerVisible(false);
    setPendingDraft(null);
  };

  const handleCancelClick = () => {
    if (dirty) {
      setConfirmDiscard(true);
    } else {
      onCancel();
    }
  };

  const handlePhotoUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("profileImageUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleDocumentUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = Array.from(files).map((f) => ({ id: `${Date.now()}-${f.name}`, name: f.name, sizeLabel: formatBytes(f.size) }));
    setDocuments((docs) => [...docs, ...next]);
    setDirty(true);
  };

  const errorCount = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={handleSubmit} className="pb-28 sm:pb-8" noValidate>
      {/* Restore draft banner */}
      {restoreBannerVisible && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand-light/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-brand-dark">
            <span className="font-semibold">You have a saved draft.</span> Would you like to restore it, or start fresh?
          </p>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={handleDiscardDraft} className="rounded-full border border-brand/40 px-3.5 py-1.5 text-xs font-medium text-brand-dark hover:bg-white">
              Discard
            </button>
            <button type="button" onClick={handleRestoreDraft} className="rounded-full bg-gradient-to-r from-brand to-brand-dark px-3.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm">
              Restore Draft
            </button>
          </div>
        </div>
      )}

      {/* Validation summary */}
      {errorCount > 0 && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <p>
            <span className="font-semibold">
              {errorCount} field{errorCount > 1 ? "s" : ""} need{errorCount === 1 ? "s" : ""} your attention.
            </span>{" "}
            Please review the highlighted fields before saving.
          </p>
        </div>
      )}

      {submitError && (
        <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle size={17} className="mt-0.5 shrink-0" /> {submitError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        {/* Section nav — vertical on desktop, horizontal scroll on mobile/tablet */}
        <nav
          aria-label="Form sections"
          className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:h-fit lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollToSection(s.id)}
              aria-current={activeSection === s.id ? "true" : undefined}
              className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-left text-sm font-medium transition lg:w-full ${
                activeSection === s.id
                  ? "bg-brand-light/60 text-brand-dark"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              }`}
            >
              <s.icon size={16} className="shrink-0" />
              {s.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-6">
          {/* Personal Information */}
          <SectionCard id="personal" title="Personal Information" icon={User} sectionRef={(el) => (sectionRefs.current.personal = el)}>
            <div className="mb-5 flex items-center gap-4">
              <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-light text-lg font-semibold text-brand-dark">
                {form.profileImageUrl ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <img src={form.profileImageUrl} className="h-full w-full object-cover" alt="" />
                ) : (
                  <>
                    {form.firstName[0] ?? ""}
                    {form.lastName[0] ?? ""}
                  </>
                )}
              </span>
              <div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                  <Camera size={13} /> Upload photo
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e.target.files?.[0])} />
                </label>
                {form.profileImageUrl && (
                  <button
                    type="button"
                    onClick={() => update("profileImageUrl", "")}
                    className="ml-2 text-xs font-medium text-gray-400 hover:text-rose-500"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FieldWithError label="First Name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} error={errors.firstName} required />
              <FieldWithError label="Last Name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} error={errors.lastName} required />
              <FieldWithError label="Date of Birth" type="date" value={form.dateOfBirth} onChange={(e) => update("dateOfBirth", e.target.value)} error={errors.dateOfBirth} required />
              <Select label="Gender" value={form.gender} onChange={(v) => update("gender", v as UiForm["gender"])} options={[...GENDER_OPTIONS]} />
            </div>
          </SectionCard>

          {/* Contact */}
          <SectionCard id="contact" title="Contact" icon={PhoneIcon} sectionRef={(el) => (sectionRefs.current.contact = el)}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FieldWithError label="Email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} error={errors.email} required />
              <FieldWithError label="Phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} error={errors.phone} required />
              {mode === "create" && (
                <FieldWithError
                  label="Password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  error={errors.password}
                  required
                />
              )}
            </div>
          </SectionCard>

          {/* Address */}
          <SectionCard id="address" title="Address" description="Optional — helps HR with mailing and emergency logistics." icon={MapPin} sectionRef={(el) => (sectionRefs.current.address = el)}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField label="Street Address" placeholder="House / street / area" value={form.addressLine1} onChange={(e) => update("addressLine1", e.target.value)} />
              </div>
              <FormField label="City" value={form.city} onChange={(e) => update("city", e.target.value)} />
              <FormField label="State / Province" value={form.state} onChange={(e) => update("state", e.target.value)} />
              <FormField label="Postal Code" value={form.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
              <FormField label="Country" value={form.country} onChange={(e) => update("country", e.target.value)} />
            </div>
          </SectionCard>

          {/* Employment Details */}
          <SectionCard id="employment" title="Employment Details" icon={Briefcase} sectionRef={(el) => (sectionRefs.current.employment = el)}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FieldWithError label="Employee Code" placeholder="e.g. EMP-1011" value={form.employeeCode} onChange={(e) => update("employeeCode", e.target.value)} error={errors.employeeCode} required />
              <FieldWithError label="Joining Date" type="date" value={form.joiningDate} onChange={(e) => update("joiningDate", e.target.value)} error={errors.joiningDate} required />
              <Select
                label="Department"
                value={form.departmentId}
                onChange={(v) => {
                  update("departmentId", v);
                  update("designationId", "");
                }}
                options={departments.map((d) => ({ value: d.departmentId, label: d.name }))}
                placeholder={refDataLoading ? "Loading…" : "Select department"}
                error={errors.departmentId}
              />
              <Select
                label="Designation"
                value={form.designationId}
                onChange={(v) => update("designationId", v)}
                options={designationsForDepartment.map((d) => ({ value: d.designationId, label: d.name }))}
                placeholder={form.departmentId ? "Select designation" : "Select a department first"}
                error={errors.designationId}
              />
              <Select
                label="Job Category"
                value={form.jobCategoryId}
                onChange={(v) => update("jobCategoryId", v)}
                options={jobCategories.map((c) => ({ value: c.jobCategoryId, label: c.name }))}
                placeholder={refDataLoading ? "Loading…" : "Select job category"}
                error={errors.jobCategoryId}
              />
              <Select
                label="Shift"
                value={form.shiftId}
                onChange={(v) => update("shiftId", v)}
                options={shifts.map((s) => ({ value: s.shiftId, label: `${s.name} (${s.startTime}–${s.endTime})` }))}
                placeholder={refDataLoading ? "Loading…" : "Select shift"}
                error={errors.shiftId}
              />
              <Select
                label="Employment Type"
                value={form.employmentType}
                onChange={(v) => update("employmentType", v as UiForm["employmentType"])}
                options={[...EMPLOYMENT_TYPE_OPTIONS]}
              />
              <Select
                label="Reporting Manager"
                value={form.managerId}
                onChange={(v) => update("managerId", v)}
                options={managerOptions}
                placeholder="No manager"
              />
            </div>
          </SectionCard>

          {/* Payroll */}
          <SectionCard id="payroll" title="Payroll" icon={Wallet} sectionRef={(el) => (sectionRefs.current.payroll = el)}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FieldWithError label="Salary" type="number" min="0" step="1000" value={form.salary} onChange={(e) => update("salary", e.target.value)} error={errors.salary} required />
              <FormField label="Bank Name" placeholder="Optional" value={form.bankName} onChange={(e) => update("bankName", e.target.value)} />
              <FormField label="Account Number" placeholder="Optional" value={form.accountNumber} onChange={(e) => update("accountNumber", e.target.value)} />
              <FormField label="IFSC / Routing Code" placeholder="Optional" value={form.ifsc} onChange={(e) => update("ifsc", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input
                type="checkbox"
                checked={form.overtimeAllowed}
                onChange={(e) => update("overtimeAllowed", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand/60"
              />
              Overtime Allowed
            </label>
          </SectionCard>

          {/* Documents */}
          <SectionCard
            id="documents"
            title="Documents"
            description="Attach ID proof, contracts, or certificates. Stored for this session only — document storage isn't wired up to the API yet."
            icon={FileUp}
            sectionRef={(el) => (sectionRefs.current.documents = el)}
          >
            <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 hover:border-brand/50 hover:bg-brand-light/10">
              <FileUp size={20} className="text-gray-400" />
              <span>
                <span className="font-semibold text-brand-dark">Click to upload</span> or drag files here
              </span>
              <input type="file" multiple className="hidden" onChange={(e) => handleDocumentUpload(e.target.files)} />
            </label>
            {documents.length > 0 && (
              <ul className="space-y-2">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
                    <Paperclip size={14} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate text-gray-700">{doc.name}</span>
                    <span className="shrink-0 text-xs text-gray-400">{doc.sizeLabel}</span>
                    <button
                      type="button"
                      onClick={() => setDocuments((docs) => docs.filter((d) => d.id !== doc.id))}
                      aria-label={`Remove ${doc.name}`}
                      className="shrink-0 text-gray-400 hover:text-rose-500"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Emergency Contact */}
          <SectionCard
            id="emergency"
            title="Emergency Contact"
            description="Optional — who should HR reach out to in an emergency."
            icon={ShieldAlert}
            sectionRef={(el) => (sectionRefs.current.emergency = el)}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <FormField label="Full Name" value={form.emergencyName} onChange={(e) => update("emergencyName", e.target.value)} />
              <FormField label="Relationship" placeholder="e.g. Spouse, Parent" value={form.emergencyRelationship} onChange={(e) => update("emergencyRelationship", e.target.value)} />
              <FormField label="Phone" value={form.emergencyPhone} onChange={(e) => update("emergencyPhone", e.target.value)} />
            </div>
          </SectionCard>

          {/* System Access */}
          <SectionCard id="system" title="System Access" icon={KeyRound} sectionRef={(el) => (sectionRefs.current.system = el)}>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Select
                label="Role"
                value={form.roleId}
                onChange={(v) => update("roleId", v)}
                options={roles.map((r) => ({ value: r.roleId, label: r.name }))}
                placeholder={refDataLoading ? "Loading…" : "Select role"}
                error={errors.roleId}
              />
              <div>
                <span className="mb-2 block text-[15px] font-medium text-gray-900">Account Status</span>
                <div className="flex min-h-[52px] items-center gap-2 rounded-lg bg-gray-100 px-4">
                  <StatusBadge status={employee?.status ?? "active"} />
                  <span className="text-xs text-gray-500">
                    {mode === "create" ? "New accounts start active." : "Change status from the employee list."}
                  </span>
                </div>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:z-auto sm:mt-6 sm:rounded-2xl sm:border sm:border-gray-100 sm:bg-white sm:px-5 sm:py-4 sm:shadow-sm">
        <div className="mx-auto flex max-w-[1600px] flex-col-reverse gap-2.5 xs:flex-row xs:items-center xs:justify-end">
          <button
            type="button"
            onClick={handleCancelClick}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <X size={15} /> Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
          >
            <Save size={15} /> {savingDraft ? "Saving…" : "Save Draft"}
          </button>
          <div className="xs:w-56">
            <PrimaryButton type="submit" loading={saving}>
              {mode === "edit" ? "Save Changes" : "Create Employee"}
            </PrimaryButton>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        description="You have unsaved edits on this form. You can save them as a draft instead, or discard them entirely."
        confirmLabel="Discard"
        cancelLabel="Keep Editing"
        tone="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          onCancel();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </form>
  );
}
