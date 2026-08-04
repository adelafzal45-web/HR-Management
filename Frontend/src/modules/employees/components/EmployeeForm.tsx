// ============================================================================
// Employee create / edit form.
//
// Speaks the backend's snake_case vocabulary throughout (via employeeService)
// rather than the legacy employeeApi camelCase model, so there is no adapter to
// drift out of sync. The previous version of this file claimed `managerId` and
// `overtimeAllowed` were unwritable long after the columns existed; that class
// of bug is what the direct types remove.
//
// Two structural decisions worth knowing:
//
//   1. The photo is deferred on create. There is no employee id to attach an
//      upload to until the POST returns, so PhotoUpload runs in deferred mode
//      and the file is sent in a follow-up request. A failed photo upload does
//      NOT fail the create — the employee exists at that point, and reporting
//      otherwise would be a lie.
//   2. Leave assignments ride along with the POST body on create (the service
//      writes them in the same transaction), but go through the dedicated
//      PATCH /users/:id/leave-types on edit, because that endpoint preserves
//      `used_days` for types that are already assigned.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  Briefcase,
  CalendarDays,
  FileUp,
  KeyRound,
  MapPin,
  Phone as PhoneIcon,
  Save,
  ShieldAlert,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { API_BASE_URL, ApiError } from "@/lib/apiClient";
import ConfirmDialog from "@/components/dialogs/ConfirmDialog";
import { PrimaryButton } from "@/components/forms/FormField";
import { useToast } from "@/app/providers/ToastContext";
import { useAuth } from "@/app/providers/AuthContext";

import { employeeService } from "@/modules/employees/api/employeeService";
import {
  loadFormLookups,
  type AssignableRole,
  type DesignationOption,
  type ShiftOption,
} from "@/modules/employees/api/lookupsApi";
import {
  EMPLOYMENT_TYPES,
  GENDERS,
  BLOOD_GROUPS,
  fullName,
  photoUrl,
  type CreateEmployeePayload,
  type DepartmentRef,
  type Employee,
  type JobCategoryRef,
  type LeaveTypeCatalogItem,
  type UpdateEmployeePayload,
} from "@/modules/employees/types/employee.types";
import {
  compact,
  validateAccountNumber,
  validateDate,
  validateDateOfBirth,
  validateEmail,
  validateEmployeeCode,
  validateName,
  validateOptionalPhone,
  validatePassword,
  validatePhone,
  validatePostalCode,
  validateRoutingCode,
  validateSalary,
  type FieldError,
} from "@/modules/employees/validation/employeeValidation";

import PhotoUpload from "@/modules/employees/components/PhotoUpload";
import LeaveTypesPicker, {
  toAssignments,
  type LeaveSelection,
} from "@/modules/employees/components/LeaveTypesPicker";
import DocumentsUpload, {
  type SessionDocument,
} from "@/modules/employees/components/DocumentsUpload";
import {
  Checkbox,
  EmployeeFormSkeleton,
  Field,
  ReadOnlyField,
  SectionCard,
  Select,
  SubmitError,
  ValidationSummary,
} from "@/modules/employees/components/EmployeeFormShell";

// ---- Form state -------------------------------------------------------------

/**
 * Every value is a string because that is what an `<input>` yields; parsing
 * happens once, at payload construction. Keeping the draft in string form also
 * means a half-typed salary survives a save-draft round trip unchanged.
 */
type FormState = {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  blood_group: string;

  email: string;
  phone: string;
  password: string;

  street_address: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;

  employee_code: string;
  joining_date: string;
  employee_type: string;
  department_id: string;
  designation_id: string;
  job_category_id: string;
  shift_id: string;
  team_lead_id: string;

  salary: string;
  bank_name: string;
  bank_account_number: string;
  bank_routing_code: string;
  is_overtime: boolean;

  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;

  role_id: string;
};

/** The spec's stated default: 01-01-2000. */
const DEFAULT_DOB = "2000-01-01";

/** Today in the `yyyy-mm-dd` form a date input expects, in local time. */
function todayISO(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const emptyForm = (): FormState => ({
  first_name: "",
  last_name: "",
  date_of_birth: DEFAULT_DOB,
  gender: "",
  blood_group: "",
  email: "",
  phone: "",
  password: "",
  street_address: "",
  city: "",
  state_province: "",
  postal_code: "",
  country: "",
  employee_code: "",
  joining_date: todayISO(),
  employee_type: "",
  department_id: "",
  designation_id: "",
  job_category_id: "",
  shift_id: "",
  team_lead_id: "",
  salary: "",
  bank_name: "",
  bank_account_number: "",
  bank_routing_code: "",
  is_overtime: false,
  emergency_contact_name: "",
  emergency_contact_relationship: "",
  emergency_contact_phone: "",
  role_id: "",
});

/** Maps a loaded employee onto the form's string-shaped state. */
function formFromEmployee(e: Employee): FormState {
  const dateOnly = (value?: string) => (value ? value.slice(0, 10) : "");
  return {
    first_name: e.first_name ?? "",
    last_name: e.last_name ?? "",
    date_of_birth: dateOnly(e.date_of_birth) || DEFAULT_DOB,
    gender: e.gender ?? "",
    blood_group: e.blood_group ?? "",
    email: e.email ?? "",
    phone: e.phone ?? "",
    password: "",
    // Fall back to the legacy free-text `address` only when the structured
    // column is empty, so an old record still shows something recognisable
    // rather than a blank street field.
    street_address: e.street_address ?? e.address ?? "",
    city: e.city ?? "",
    state_province: e.state_province ?? "",
    postal_code: e.postal_code ?? "",
    country: e.country ?? "",
    employee_code: e.employee_code ?? "",
    joining_date: dateOnly(e.joining_date),
    employee_type: e.employee_type ?? "",
    department_id: e.department?.department_id ?? "",
    designation_id: e.designation?.designation_id ?? "",
    job_category_id: e.jobCategory?.job_category_id ?? "",
    shift_id: e.shift?.shift_id ?? "",
    team_lead_id: e.team_lead_id ?? e.teamLead?.user_id ?? "",
    salary: e.salary === undefined || e.salary === null ? "" : String(e.salary),
    bank_name: e.bank_name ?? "",
    bank_account_number: e.bank_account_number ?? "",
    bank_routing_code: e.bank_routing_code ?? "",
    is_overtime: Boolean(e.is_overtime),
    emergency_contact_name: e.emergency_contact_name ?? "",
    emergency_contact_relationship: e.emergency_contact_relationship ?? "",
    emergency_contact_phone: e.emergency_contact_phone ?? "",
    role_id: e.role?.role_id ?? "",
  };
}

// ---- Sections ---------------------------------------------------------------

const SECTIONS = [
  { id: "personal", label: "Personal Information", icon: User },
  { id: "contact", label: "Contact", icon: PhoneIcon },
  { id: "address", label: "Address", icon: MapPin },
  { id: "employment", label: "Employment Details", icon: Briefcase },
  { id: "team", label: "Team Lead", icon: Users },
  { id: "leave", label: "Leave Types", icon: CalendarDays },
  { id: "payroll", label: "Payroll", icon: Wallet },
  { id: "documents", label: "Documents", icon: FileUp },
  { id: "emergency", label: "Emergency Contact", icon: ShieldAlert },
  { id: "system", label: "System Access", icon: KeyRound },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** Lets a validation failure scroll the user to the offending field. */
const FIELD_SECTION: Partial<Record<keyof FormState, SectionId>> = {
  first_name: "personal",
  last_name: "personal",
  date_of_birth: "personal",
  gender: "personal",
  email: "contact",
  phone: "contact",
  password: "contact",
  street_address: "address",
  city: "address",
  state_province: "address",
  postal_code: "address",
  country: "address",
  employee_code: "employment",
  joining_date: "employment",
  employee_type: "employment",
  department_id: "employment",
  designation_id: "employment",
  job_category_id: "employment",
  shift_id: "employment",
  salary: "payroll",
  bank_account_number: "payroll",
  bank_routing_code: "payroll",
  emergency_contact_phone: "emergency",
  role_id: "system",
};

// ---- Component --------------------------------------------------------------

type EmployeeFormProps = {
  mode: "create" | "edit";
  /** Required in edit mode; the caller loads it so this component stays sync. */
  employee?: Employee | null;
  onCancel: () => void;
  /** Passed the saved employee so the caller can navigate to it. */
  onSaved: (employee: Employee) => void;
};

export default function EmployeeForm({
  mode,
  employee,
  onCancel,
  onSaved,
}: EmployeeFormProps) {
  const toast = useToast();
  const { hasPermission } = useAuth();

  const isEdit = mode === "edit";
  const draftKey = isEdit
    ? `hrms.employees.draft.edit.${employee?.user_id ?? ""}`
    : "hrms.employees.draft.create";

  // Salary and employee code are separately permissioned; an HR user without
  // `employees.salary.edit` still needs to be able to save the rest of the form,
  // so those controls render read-only rather than disappearing.
  const canEditSalary = hasPermission("employees.salary.edit");
  const canViewSalary = hasPermission("employees.salary.view") || canEditSalary;
  const canAssignRole = hasPermission("employees.role.assign");
  const canAssignTeamLead = hasPermission("employees.teamlead.assign");
  const canAssignLeave = hasPermission("employees.leave.assign");
  const canEditEmergency =
    hasPermission("employees.emergency.edit") || !isEdit;

  const [form, setForm] = useState<FormState>(() =>
    employee ? formFromEmployee(employee) : emptyForm(),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [activeSection, setActiveSection] = useState<SectionId>("personal");

  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<FormState | null>(null);

  // Photo, leave and documents live outside `form` because none of them is a
  // string field and none belongs in a localStorage draft (a File cannot be
  // serialised, and silently dropping it would be worse than not offering it).
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoCleared, setPhotoCleared] = useState(false);
  const [leaveRows, setLeaveRows] = useState<LeaveSelection[]>([]);
  const [documents, setDocuments] = useState<SessionDocument[]>([]);

  const [departments, setDepartments] = useState<DepartmentRef[]>([]);
  const [designations, setDesignations] = useState<DesignationOption[]>([]);
  const [jobCategories, setJobCategories] = useState<JobCategoryRef[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveTypeCatalogItem[]>([]);
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [lookupsLoading, setLookupsLoading] = useState(true);
  const [lookupsError, setLookupsError] = useState<string | null>(null);

  const [teamLeads, setTeamLeads] = useState<Employee[]>([]);
  const [teamLeadsLoading, setTeamLeadsLoading] = useState(false);

  const sectionRefs = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});

  // ---- Reference data ------------------------------------------------------

  useEffect(() => {
    let alive = true;
    setLookupsLoading(true);
    setLookupsError(null);

    loadFormLookups()
      .then((data) => {
        if (!alive) return;
        setDepartments(data.departments);
        setDesignations(data.designations);
        setJobCategories(data.jobCategories);
        setShifts(data.shifts);
        setLeaveTypes(data.leaveTypes);
        setRoles(data.roles);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        // A failed lookup load is fatal for the form: every required select
        // would be empty, and letting the user type into the rest only to hit a
        // wall at submit is worse than saying so now.
        setLookupsError(
          error instanceof ApiError
            ? error.message
            : "Could not load departments, roles and other reference data.",
        );
      })
      .finally(() => {
        if (alive) setLookupsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // Existing leave balances, so the edit form opens with the real allocations
  // rather than re-seeding from each type's annual default.
  useEffect(() => {
    if (!isEdit || !employee?.user_id) return;
    let alive = true;

    employeeService
      .leaveBalances(employee.user_id)
      .then((balances) => {
        if (!alive) return;
        setLeaveRows(
          balances.map((b) => ({
            leave_type_id: b.leave_type_id,
            allocated_days: Number(b.allocated_days) || 0,
            used_days: Number(b.used_days) || 0,
          })),
        );
      })
      .catch(() => {
        // Non-fatal: the picker simply starts empty. Surfacing a toast here
        // would fire on every edit-page open for an employee who has no
        // balances yet, which is the normal case.
      });

    return () => {
      alive = false;
    };
  }, [isEdit, employee?.user_id]);

  /**
   * Team leads for the selected department.
   *
   * The spec is explicit: "Automatically load only Team Leads of that
   * department. Do NOT show employees from other departments." So this refetches
   * on every department change and clears the current selection whenever it is
   * no longer in the returned set — an employee must never be left pointing at
   * a lead outside their own department.
   */
  useEffect(() => {
    if (!form.department_id) {
      setTeamLeads([]);
      return;
    }

    let alive = true;
    setTeamLeadsLoading(true);

    employeeService
      .teamLeads(form.department_id)
      .then((leads) => {
        if (!alive) return;
        // An employee cannot be their own team lead.
        const eligible = leads.filter((l) => l.user_id !== employee?.user_id);
        setTeamLeads(eligible);
        setForm((prev) =>
          prev.team_lead_id &&
          !eligible.some((l) => l.user_id === prev.team_lead_id)
            ? { ...prev, team_lead_id: "" }
            : prev,
        );
      })
      .catch(() => {
        if (alive) setTeamLeads([]);
      })
      .finally(() => {
        if (alive) setTeamLeadsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [form.department_id, employee?.user_id]);

  // Offer to restore a saved draft. Read once per form identity, not merged
  // automatically — silently overwriting fields the user is looking at is
  // disorienting.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setPendingDraft(JSON.parse(raw) as FormState);
    } catch {
      // Corrupt or unavailable storage is not worth reporting.
    }
  }, [draftKey]);

  // Scroll-spy for the section nav. A section becomes active once it reaches
  // the top ~35% of the viewport and stays active until the next one does.
  useEffect(() => {
    if (lookupsLoading) return;

    const els = SECTIONS.map((s) => document.getElementById(`section-${s.id}`)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        const id = topMost.target.id.replace("section-", "") as SectionId;
        setActiveSection((current) => (current === id ? current : id));
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: 0 },
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [lookupsLoading]);

  // Warn on tab close / reload with unsaved edits. In-app navigation is handled
  // by the cancel confirmation instead.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ---- Derived options -----------------------------------------------------

  /**
   * Designations belonging to the chosen department.
   *
   * Designations whose department is null are treated as global and always
   * offered — the settings module allows creating them that way, and hiding
   * them would make those rows unusable from this form.
   */
  const designationOptions = useMemo(() => {
    const scoped = designations.filter(
      (d) => !d.department || d.department.department_id === form.department_id,
    );
    return scoped.map((d) => ({ value: d.designation_id, label: d.title }));
  }, [designations, form.department_id]);

  const teamLeadOptions = useMemo(
    () =>
      teamLeads.map((l) => ({
        value: l.user_id,
        label: `${fullName(l)} · ${l.employee_code}${
          l.designation?.title ? ` · ${l.designation.title}` : ""
        }`,
      })),
    [teamLeads],
  );

  const currentPhotoUrl = photoCleared
    ? undefined
    : photoUrl(employee?.profile_image, API_BASE_URL);

  // ---- Field updates -------------------------------------------------------

  const update = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
      // Clear the field's error as soon as it is touched; re-validation happens
      // on submit. Keeping a stale message next to a field the user has just
      // fixed reads as though the fix didn't take.
      setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    },
    [],
  );

  /** Department drives designation and team lead, so both reset with it. */
  const onDepartmentChange = useCallback((departmentId: string) => {
    setForm((prev) => ({
      ...prev,
      department_id: departmentId,
      designation_id: "",
      team_lead_id: "",
    }));
    setDirty(true);
    setErrors((prev) => ({
      ...prev,
      department_id: undefined,
      designation_id: undefined,
    }));
  }, []);

  const scrollToSection = useCallback((id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ---- Validation ----------------------------------------------------------

  /**
   * Validates the whole form, mirroring the backend DTOs.
   *
   * On edit, password is absent (credentials go through the reset endpoint) and
   * `employee_code` becomes editable, so both are conditioned on mode.
   */
  const validate = useCallback((): Partial<Record<keyof FormState, string>> => {
    const raw: Record<string, FieldError> = {
      first_name: validateName(form.first_name, "First name"),
      last_name: validateName(form.last_name, "Last name"),
      date_of_birth: validateDateOfBirth(form.date_of_birth),
      gender: form.gender ? undefined : "Gender is required.",

      email: validateEmail(form.email),
      phone: validatePhone(form.phone),
      password: isEdit ? undefined : validatePassword(form.password),

      street_address: form.street_address.trim()
        ? undefined
        : "Street address is required.",
      city: form.city.trim() ? undefined : "City is required.",
      state_province: form.state_province.trim()
        ? undefined
        : "State / province is required.",
      postal_code: validatePostalCode(form.postal_code),
      country: form.country.trim() ? undefined : "Country is required.",

      employee_code: isEdit ? validateEmployeeCode(form.employee_code) : undefined,
      joining_date: validateDate(form.joining_date, "Joining date"),
      employee_type: form.employee_type ? undefined : "Employment type is required.",
      department_id: form.department_id ? undefined : "Department is required.",
      designation_id: form.designation_id ? undefined : "Designation is required.",
      job_category_id: form.job_category_id ? undefined : "Job category is required.",
      shift_id: form.shift_id ? undefined : "Shift is required.",

      // Only validate salary when this user is allowed to set it; otherwise the
      // field is read-only and its value came from the server.
      salary: canEditSalary ? validateSalary(form.salary) : undefined,
      bank_account_number: validateAccountNumber(form.bank_account_number),
      bank_routing_code: validateRoutingCode(form.bank_routing_code),

      emergency_contact_name: form.emergency_contact_name.trim()
        ? validateName(form.emergency_contact_name, "Emergency contact name")
        : undefined,
      emergency_contact_phone: validateOptionalPhone(
        form.emergency_contact_phone,
        "Emergency contact phone",
      ),

      role_id: form.role_id ? undefined : "Role is required.",
    };

    return compact<FormState>(raw);
  }, [form, isEdit, canEditSalary]);

  // ---- Payload -------------------------------------------------------------

  /** Trims, and drops empty optionals so the DTO's @IsOptional sees absence. */
  const buildPayload = useCallback((): CreateEmployeePayload => {
    const t = (v: string) => v.trim();
    const optional = (v: string) => {
      const trimmed = v.trim();
      return trimmed === "" ? undefined : trimmed;
    };

    return {
      first_name: t(form.first_name),
      last_name: t(form.last_name),
      email: t(form.email),
      password: form.password,
      phone: t(form.phone),
      date_of_birth: form.date_of_birth,
      gender: form.gender,
      blood_group: optional(form.blood_group),

      street_address: t(form.street_address),
      city: t(form.city),
      state_province: t(form.state_province),
      postal_code: t(form.postal_code),
      country: t(form.country),

      joining_date: form.joining_date,
      employee_type: form.employee_type,
      department_id: form.department_id,
      designation_id: form.designation_id,
      job_category_id: form.job_category_id,
      shift_id: form.shift_id,
      team_lead_id: optional(form.team_lead_id),

      role_id: form.role_id,

      salary: Number(form.salary),
      bank_name: optional(form.bank_name),
      bank_account_number: optional(form.bank_account_number),
      bank_routing_code: optional(form.bank_routing_code),
      is_overtime: form.is_overtime,

      emergency_contact_name: optional(form.emergency_contact_name),
      emergency_contact_relationship: optional(form.emergency_contact_relationship),
      emergency_contact_phone: optional(form.emergency_contact_phone),
    };
  }, [form]);

  // ---- Submit --------------------------------------------------------------

  /**
   * Uploads the deferred photo after the employee exists.
   *
   * Failure is reported as a warning, not an error, and deliberately does not
   * fail the surrounding save: by this point the employee record is committed,
   * so claiming the operation failed would send the user back to re-enter a
   * form whose contents are already in the database.
   */
  const uploadDeferredPhoto = useCallback(
    async (employeeId: string): Promise<Employee | null> => {
      if (!photoFile) return null;
      try {
        return await employeeService.uploadPhoto(employeeId, photoFile);
      } catch (error) {
        toast.showError(
          "Employee saved, but the photo didn't upload.",
          error instanceof ApiError
            ? error.message
            : "You can add the photo from the employee's profile.",
        );
        return null;
      }
    },
    [photoFile, toast],
  );

  /** Same contract as the photo: the record is already saved by this point. */
  const saveLeaveAssignments = useCallback(
    async (employeeId: string) => {
      if (!canAssignLeave) return;
      try {
        await employeeService.assignLeaveTypes(employeeId, toAssignments(leaveRows));
      } catch (error) {
        toast.showError(
          "Employee saved, but leave types didn't update.",
          error instanceof ApiError
            ? error.message
            : "You can adjust leave types from the employee's record.",
        );
      }
    },
    [canAssignLeave, leaveRows, toast],
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const validationErrors = validate();
    setErrors(validationErrors);

    const firstKey = Object.keys(validationErrors)[0] as keyof FormState | undefined;
    if (firstKey) {
      const section = FIELD_SECTION[firstKey];
      if (section) scrollToSection(section);
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      let saved: Employee;

      if (isEdit && employee) {
        // Password is not part of the update DTO — a credential change goes
        // through POST /users/:id/reset-password so it is separately
        // permissioned and audited.
        const { password: _password, ...rest } = payload;
        const updatePayload: UpdateEmployeePayload = {
          ...rest,
          employee_code: form.employee_code.trim() || undefined,
        };
        // Don't send a salary this user isn't allowed to change; the backend
        // would reject it, and re-sending the server's own value is noise in the
        // audit log either way.
        if (!canEditSalary) delete updatePayload.salary;

        saved = await employeeService.update(employee.user_id, updatePayload);

        if (photoFile) {
          const withPhoto = await uploadDeferredPhoto(saved.user_id);
          if (withPhoto) saved = withPhoto;
        }
        await saveLeaveAssignments(saved.user_id);

        toast.showSuccess(
          "Employee updated.",
          `${fullName(saved)}'s record has been saved.`,
        );
      } else {
        // Leave assignments ride along in the create body so they land in the
        // same transaction as the employee row.
        saved = await employeeService.create({
          ...payload,
          ...(canAssignLeave && leaveRows.length > 0
            ? { leave_assignments: toAssignments(leaveRows) }
            : {}),
        });

        if (photoFile) {
          const withPhoto = await uploadDeferredPhoto(saved.user_id);
          if (withPhoto) saved = withPhoto;
        }

        toast.showSuccess(
          "Employee created.",
          `${fullName(saved)} has been added as ${saved.employee_code}.`,
        );
      }

      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Nothing to do — the draft is a convenience, not state we depend on.
      }

      setDirty(false);
      onSaved(saved);
    } catch (error) {
      // Field-level conflicts (duplicate email, duplicate code) come back as a
      // 409 with a message naming the field; put it on that field as well as in
      // the banner so the user can see where to look.
      const message =
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Please try again.";
      setSubmitError(message);

      if (/email/i.test(message)) {
        setErrors((prev) => ({ ...prev, email: message }));
        scrollToSection("contact");
      } else if (/employee\s*code/i.test(message)) {
        setErrors((prev) => ({ ...prev, employee_code: message }));
        scrollToSection("employment");
      }
    } finally {
      setSaving(false);
    }
  };

  // ---- Draft ---------------------------------------------------------------

  const handleSaveDraft = () => {
    setSavingDraft(true);
    try {
      localStorage.setItem(draftKey, JSON.stringify(form));
      toast.showSuccess(
        "Draft saved.",
        "Text fields are stored on this device. Photo and document selections are not.",
      );
      setDirty(false);
    } catch {
      toast.showError(
        "Couldn't save the draft.",
        "Your browser's storage may be full or unavailable.",
      );
    } finally {
      setSavingDraft(false);
    }
  };

  const handleRestoreDraft = () => {
    if (pendingDraft) {
      setForm(pendingDraft);
      setDirty(true);
    }
    setPendingDraft(null);
  };

  const handleDiscardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setPendingDraft(null);
  };

  // ---- Render --------------------------------------------------------------

  if (lookupsLoading) return <EmployeeFormSkeleton />;

  if (lookupsError) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-semibold text-rose-800">
          This form can&apos;t be loaded right now.
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-rose-700">{lookupsError}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-full border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50"
        >
          Try again
        </button>
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;
  const setRef = (id: SectionId) => (el: HTMLDivElement | null) => {
    sectionRefs.current[id] = el;
  };

  return (
    <form onSubmit={handleSubmit} className="pb-28 sm:pb-8" noValidate>
      {pendingDraft && (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-brand/30 bg-brand-light/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-brand-dark">
            <span className="font-semibold">You have a saved draft.</span> Restore it,
            or start from the current values?
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="rounded-full border border-brand/40 px-3.5 py-1.5 text-xs font-medium text-brand-dark transition hover:bg-white"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="rounded-full bg-gradient-to-r from-brand to-brand-dark px-3.5 py-1.5 text-xs font-semibold text-gray-900 shadow-sm"
            >
              Restore draft
            </button>
          </div>
        </div>
      )}

      <ValidationSummary count={errorCount} />
      <SubmitError message={submitError} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
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
          {/* ---- Personal ---------------------------------------------- */}
          <SectionCard
            id="personal"
            title="Personal Information"
            icon={User}
            sectionRef={setRef("personal")}
          >
            <div className="mb-6">
              <span className="mb-2 block text-[15px] font-medium text-gray-900">
                Photo
              </span>
              <PhotoUpload
                currentUrl={currentPhotoUrl}
                // Deferred in both modes: on create there is no id yet, and on
                // edit it keeps the photo part of the single save action rather
                // than committing the moment a file is picked.
                onFileSelected={(file) => {
                  setPhotoFile(file);
                  setPhotoCleared(file === null);
                  setDirty(true);
                }}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field
                label="First Name"
                name="first_name"
                requiredMark
                value={form.first_name}
                onChange={(e) => update("first_name", e.target.value)}
                error={errors.first_name}
                autoComplete="given-name"
              />
              <Field
                label="Last Name"
                name="last_name"
                requiredMark
                value={form.last_name}
                onChange={(e) => update("last_name", e.target.value)}
                error={errors.last_name}
                autoComplete="family-name"
              />
              <Field
                label="Date of Birth"
                name="date_of_birth"
                type="date"
                requiredMark
                value={form.date_of_birth}
                onChange={(e) => update("date_of_birth", e.target.value)}
                error={errors.date_of_birth}
              />
              <Select
                label="Gender"
                requiredMark
                value={form.gender}
                onChange={(v) => update("gender", v)}
                options={GENDERS.map((g) => ({ value: g, label: g }))}
                placeholder="Select gender"
                error={errors.gender}
              />
              <Select
                label="Blood Group"
                value={form.blood_group}
                onChange={(v) => update("blood_group", v)}
                options={BLOOD_GROUPS.map((b) => ({ value: b, label: b }))}
                placeholder="Not specified"
                hint="Shown on the employee ID card when set."
              />
            </div>
          </SectionCard>

          {/* ---- Contact ----------------------------------------------- */}
          <SectionCard
            id="contact"
            title="Contact"
            description="The email address doubles as the sign-in identifier."
            icon={PhoneIcon}
            sectionRef={setRef("contact")}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field
                label="Contact Email"
                name="email"
                type="email"
                requiredMark
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                error={errors.email}
                autoComplete="email"
              />
              <Field
                label="Phone"
                name="phone"
                type="tel"
                requiredMark
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                error={errors.phone}
                autoComplete="tel"
              />
              {isEdit ? (
                <div className="sm:col-span-2">
                  <ReadOnlyField
                    label="Password"
                    value="Set by the employee"
                    hint="Use the Reset Password action on the employee's record to issue a new one."
                  />
                </div>
              ) : (
                <Field
                  label="Password"
                  name="password"
                  type="password"
                  requiredMark
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  error={errors.password}
                  autoComplete="new-password"
                  hint="At least 8 characters, with upper and lower case, a number and a symbol."
                />
              )}
            </div>
          </SectionCard>

          {/* ---- Address ----------------------------------------------- */}
          <SectionCard
            id="address"
            title="Address"
            description="House / street / area, and the rest of the postal address."
            icon={MapPin}
            sectionRef={setRef("address")}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Street Address"
                  name="street_address"
                  requiredMark
                  placeholder="House / street / area"
                  value={form.street_address}
                  onChange={(e) => update("street_address", e.target.value)}
                  error={errors.street_address}
                  autoComplete="street-address"
                />
              </div>
              <Field
                label="City"
                name="city"
                requiredMark
                value={form.city}
                onChange={(e) => update("city", e.target.value)}
                error={errors.city}
                autoComplete="address-level2"
              />
              <Field
                label="State / Province"
                name="state_province"
                requiredMark
                value={form.state_province}
                onChange={(e) => update("state_province", e.target.value)}
                error={errors.state_province}
                autoComplete="address-level1"
              />
              <Field
                label="Postal Code"
                name="postal_code"
                requiredMark
                value={form.postal_code}
                onChange={(e) => update("postal_code", e.target.value)}
                error={errors.postal_code}
                autoComplete="postal-code"
              />
              <Field
                label="Country"
                name="country"
                requiredMark
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                error={errors.country}
                autoComplete="country-name"
              />
            </div>
          </SectionCard>

          {/* ---- Employment -------------------------------------------- */}
          <SectionCard
            id="employment"
            title="Employment Details"
            icon={Briefcase}
            sectionRef={setRef("employment")}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {isEdit ? (
                <Field
                  label="Employee Code"
                  name="employee_code"
                  requiredMark
                  value={form.employee_code}
                  onChange={(e) => update("employee_code", e.target.value)}
                  error={errors.employee_code}
                  hint="Format TC-EMP-001. Must stay unique across all employees."
                />
              ) : (
                <ReadOnlyField
                  label="Employee Code"
                  value={<span className="italic">Generated on save</span>}
                  // Generated server-side inside a locked transaction; letting
                  // the form propose one would reintroduce the duplicate-code
                  // race that lock exists to prevent.
                  hint="The next code in sequence (TC-EMP-001, TC-EMP-002, …) is assigned automatically."
                />
              )}
              <Field
                label="Joining Date"
                name="joining_date"
                type="date"
                requiredMark
                value={form.joining_date}
                onChange={(e) => update("joining_date", e.target.value)}
                error={errors.joining_date}
              />
              <Select
                label="Department"
                requiredMark
                value={form.department_id}
                onChange={onDepartmentChange}
                options={departments.map((d) => ({
                  value: d.department_id,
                  label: d.department_name,
                }))}
                placeholder="Select department"
                error={errors.department_id}
              />
              <Select
                label="Designation"
                requiredMark
                value={form.designation_id}
                onChange={(v) => update("designation_id", v)}
                options={designationOptions}
                disabled={!form.department_id}
                placeholder={
                  form.department_id
                    ? designationOptions.length > 0
                      ? "Select designation"
                      : "No designations in this department"
                    : "Select a department first"
                }
                error={errors.designation_id}
              />
              <Select
                label="Job Category"
                requiredMark
                value={form.job_category_id}
                onChange={(v) => update("job_category_id", v)}
                options={jobCategories.map((c) => ({
                  value: c.job_category_id,
                  label: c.job_category_name,
                }))}
                placeholder="Select job category"
                error={errors.job_category_id}
              />
              <Select
                label="Shift"
                requiredMark
                value={form.shift_id}
                onChange={(v) => update("shift_id", v)}
                options={shifts.map((s) => ({
                  value: s.shift_id,
                  label:
                    s.start_time && s.end_time
                      ? `${s.shift_name} (${s.start_time}–${s.end_time})`
                      : s.shift_name,
                }))}
                placeholder="Select shift"
                error={errors.shift_id}
              />
              <Select
                label="Employment Type"
                requiredMark
                value={form.employee_type}
                onChange={(v) => update("employee_type", v)}
                options={EMPLOYMENT_TYPES.map((t) => ({ value: t, label: t }))}
                placeholder="Select employment type"
                error={errors.employee_type}
              />
            </div>
          </SectionCard>

          {/* ---- Team Lead --------------------------------------------- */}
          <SectionCard
            id="team"
            title="Team Lead"
            description="Only team leads from the selected department are listed."
            icon={Users}
            sectionRef={setRef("team")}
          >
            {canAssignTeamLead ? (
              <Select
                label="Team Lead"
                value={form.team_lead_id}
                onChange={(v) => update("team_lead_id", v)}
                options={teamLeadOptions}
                disabled={!form.department_id || teamLeadsLoading}
                placeholder={
                  !form.department_id
                    ? "Select a department first"
                    : teamLeadsLoading
                      ? "Loading team leads…"
                      : teamLeadOptions.length > 0
                        ? "No team lead"
                        : "No team leads in this department yet"
                }
                hint={
                  teamLeadOptions.length > 0
                    ? "An employee reports to a single team lead. Changing the department clears this."
                    : undefined
                }
              />
            ) : (
              <ReadOnlyField
                label="Team Lead"
                value={
                  employee?.teamLead ? fullName(employee.teamLead) : "Not assigned"
                }
                hint="You don't have permission to change the team lead."
              />
            )}
          </SectionCard>

          {/* ---- Leave ------------------------------------------------- */}
          <SectionCard
            id="leave"
            title="Allowed Leave Types"
            description="Tick the leave types this employee may request, and set the allocation for each."
            icon={CalendarDays}
            sectionRef={setRef("leave")}
          >
            {canAssignLeave ? (
              <LeaveTypesPicker
                catalog={leaveTypes}
                value={leaveRows}
                onChange={(next) => {
                  setLeaveRows(next);
                  setDirty(true);
                }}
                // Nothing has been consumed on a brand-new employee, so the
                // used/remaining columns would only ever read 0 on create.
                showUsedDays={isEdit}
                disabled={saving}
              />
            ) : (
              <p className="text-sm text-gray-500">
                You don&apos;t have permission to assign leave types.
              </p>
            )}
          </SectionCard>

          {/* ---- Payroll ----------------------------------------------- */}
          <SectionCard
            id="payroll"
            title="Payroll"
            icon={Wallet}
            sectionRef={setRef("payroll")}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {canEditSalary ? (
                <Field
                  label="Salary"
                  name="salary"
                  type="number"
                  min="0"
                  step="0.01"
                  requiredMark
                  value={form.salary}
                  onChange={(e) => update("salary", e.target.value)}
                  error={errors.salary}
                />
              ) : (
                <ReadOnlyField
                  label="Salary"
                  value={
                    canViewSalary && form.salary
                      ? form.salary
                      : "Hidden"
                  }
                  hint={
                    canViewSalary
                      ? "You don't have permission to change salary."
                      : "You don't have permission to view salary."
                  }
                />
              )}
              <Field
                label="Bank Name"
                name="bank_name"
                placeholder="Optional"
                value={form.bank_name}
                onChange={(e) => update("bank_name", e.target.value)}
              />
              <Field
                label="Account Number"
                name="bank_account_number"
                placeholder="Optional"
                value={form.bank_account_number}
                onChange={(e) => update("bank_account_number", e.target.value)}
                error={errors.bank_account_number}
              />
              <Field
                label="IFSC / Routing Code"
                name="bank_routing_code"
                placeholder="Optional"
                value={form.bank_routing_code}
                onChange={(e) => update("bank_routing_code", e.target.value)}
                error={errors.bank_routing_code}
              />
            </div>
            <Checkbox
              label="Overtime allowed"
              description="Lets this employee log overtime hours against their shift."
              checked={form.is_overtime}
              onChange={(checked) => update("is_overtime", checked)}
            />
          </SectionCard>

          {/* ---- Documents --------------------------------------------- */}
          <SectionCard
            id="documents"
            title="Documents"
            description="ID proof, certificates, contracts and anything else worth keeping on file."
            icon={FileUp}
            sectionRef={setRef("documents")}
          >
            <DocumentsUpload
              value={documents}
              onChange={setDocuments}
              disabled={saving}
            />
          </SectionCard>

          {/* ---- Emergency contact ------------------------------------- */}
          <SectionCard
            id="emergency"
            title="Emergency Contact"
            description="Who HR should reach out to in an emergency."
            icon={ShieldAlert}
            sectionRef={setRef("emergency")}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field
                label="Full Name"
                name="emergency_contact_name"
                value={form.emergency_contact_name}
                onChange={(e) => update("emergency_contact_name", e.target.value)}
                error={errors.emergency_contact_name}
                disabled={!canEditEmergency}
              />
              <Field
                label="Relationship"
                name="emergency_contact_relationship"
                placeholder="e.g. Spouse, Parent"
                value={form.emergency_contact_relationship}
                onChange={(e) =>
                  update("emergency_contact_relationship", e.target.value)
                }
                disabled={!canEditEmergency}
              />
              <Field
                label="Phone"
                name="emergency_contact_phone"
                type="tel"
                value={form.emergency_contact_phone}
                onChange={(e) => update("emergency_contact_phone", e.target.value)}
                error={errors.emergency_contact_phone}
                disabled={!canEditEmergency}
              />
            </div>
          </SectionCard>

          {/* ---- System access ----------------------------------------- */}
          <SectionCard
            id="system"
            title="System Access"
            icon={KeyRound}
            sectionRef={setRef("system")}
          >
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              {canAssignRole ? (
                <Select
                  label="Assign Role"
                  requiredMark
                  value={form.role_id}
                  onChange={(v) => update("role_id", v)}
                  // The backend returns only roles whose permission set is a
                  // subset of the caller's own, so this list is already the
                  // authoritative answer — never widen it client-side.
                  options={roles.map((r) => ({ value: r.role_id, label: r.role_name }))}
                  placeholder="Select role"
                  error={errors.role_id}
                  hint="Only roles you're permitted to assign are listed."
                />
              ) : (
                <ReadOnlyField
                  label="Assign Role"
                  value={employee?.role?.role_name ?? "Not assigned"}
                  hint="You don't have permission to assign roles."
                />
              )}
              <ReadOnlyField
                label="Account Status"
                value={
                  isEdit
                    ? employee?.status
                      ? "Active"
                      : "Inactive"
                    : "Active on creation"
                }
                hint={
                  isEdit
                    ? "Status and login controls live in Account Settings on the employee's record."
                    : "New accounts start active with login enabled."
                }
              />
            </div>
          </SectionCard>

        </div>
      </div>

      {/* Sticky action bar — fixed on mobile, inline from `sm` up. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:z-auto sm:mt-6 sm:rounded-2xl sm:border sm:border-gray-100 sm:bg-white sm:px-5 sm:py-4 sm:shadow-sm">
        <div className="mx-auto flex max-w-[1600px] flex-col-reverse gap-2.5 xs:flex-row xs:items-center xs:justify-end">
          <button
            type="button"
            onClick={() => (dirty ? setConfirmDiscard(true) : onCancel())}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <X size={15} /> Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft || saving}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
          >
            <Save size={15} /> {savingDraft ? "Saving…" : "Save draft"}
          </button>
          <div className="xs:w-56">
            <PrimaryButton type="submit" loading={saving}>
              {isEdit ? "Save changes" : "Create employee"}
            </PrimaryButton>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        description="You have unsaved edits on this form. You can save them as a draft instead, or discard them entirely."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
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

