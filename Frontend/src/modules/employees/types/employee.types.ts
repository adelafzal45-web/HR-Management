// ============================================================================
// Employee Management — wire types.
//
// These mirror the backend DTOs and entity field-for-field, in snake_case, so
// there is no translation layer to drift out of sync. The previous employeeApi
// carried a camelCase `Employee` model plus `toApiBody`/`fromApiUser` adapters;
// that indirection is what let it keep claiming `managerId` and
// `overtimeAllowed` were unwritable long after `team_lead_id` and `is_overtime`
// existed. Speaking the backend's own vocabulary removes the class of bug.
//
// Verified against:
//   Backend/src/users/user.entity.ts
//   Backend/src/users/dto/{create-user,update-user,employee-query,
//                          update-account-settings,assign-leave-types,
//                          reset-password,update-own-profile}.dto.ts
//   Backend/src/users/users.controller.ts
// ============================================================================

/** Standard list envelope returned by every paginated backend endpoint. */
export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// ---- Enumerations (exact backend strings — see dto/validation.constants.ts) --

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export type Gender = (typeof GENDERS)[number];

export const EMPLOYMENT_TYPES = [
  'Full-Time',
  'Part-Time',
  'Contract',
  'Intern',
  'Probation',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const EMPLOYEE_SORT_FIELDS = [
  'employee_code',
  'first_name',
  'last_name',
  'email',
  'joining_date',
  'created_at',
  'status',
  'salary',
] as const;
export type EmployeeSortField = (typeof EMPLOYEE_SORT_FIELDS)[number];

// ---- Nested relation shapes as returned by the API --------------------------

export type RoleRef = { role_id: string; role_name: string };
export type DepartmentRef = { department_id: string; department_name: string };
/** The designation's display field is `title`, not `name`. */
export type DesignationRef = { designation_id: string; title: string };
export type ShiftRef = { shift_id: string; shift_name: string };
export type JobCategoryRef = { job_category_id: string; job_category_name: string };

/** Minimal self-referencing shape for the Team Lead relation. */
export type TeamLeadRef = {
  user_id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  profile_image?: string;
  /** 128px WebP derivative of `profile_image`, for small renderings. */
  profile_image_thumb?: string;
  designation?: DesignationRef;
  department?: DepartmentRef;
  status?: boolean;
};

// ---- The employee record ---------------------------------------------------

export type Employee = {
  user_id: string;
  employee_code: string;

  // Personal
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  profile_image?: string;
  /** 128px WebP derivative of `profile_image`, for small renderings. */
  profile_image_thumb?: string;
  date_of_birth?: string;
  gender?: string;
  blood_group?: string;

  // Address — a single free-text field. The structured street/city/state /
  // postal/country columns were merged back into this and dropped.
  address?: string;

  // Emergency contact
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;

  // Payroll. `salary` is a number here because the entity's decimal
  // transformer parses it — pg would otherwise hand back "85000.00".
  salary?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_routing_code?: string;

  // Employment
  employee_type: string;
  joining_date: string;
  status: boolean;
  working_hours?: number;
  overtime_hours?: number;
  is_overtime: boolean;
  attendance_status?: string;

  // Account state flags
  login_enabled: boolean;
  password_reset_allowed: boolean;
  web_login_allowed: boolean;
  mobile_login_allowed: boolean;
  api_access_allowed: boolean;
  multi_device_login_allowed: boolean;
  remote_attendance_allowed: boolean;
  biometric_attendance_allowed: boolean;

  // Relations
  role?: RoleRef;
  department?: DepartmentRef;
  designation?: DesignationRef;
  shift?: ShiftRef;
  jobCategory?: JobCategoryRef;
  teamLead?: TeamLeadRef | null;
  team_lead_id?: string | null;

  /** Present only when the list was queried with include_team_count=true. */
  team_member_count?: number;

  created_at: string;
  updated_at: string;
};

// ---- Leave --------------------------------------------------------------

export type LeaveTypeCatalogItem = {
  leave_type_id: string;
  name: string;
  description?: string;
  is_paid: boolean;
  max_days_per_year: number;
  carry_forward_allowed: boolean;
  max_carry_forward_days: number;
  is_active: boolean;
};

/**
 * One row of an employee's leave entitlement. `remaining_days` is derived
 * server-side as allocated - used, so the UI never recomputes it.
 */
export type LeaveBalance = {
  user_leave_balance_id: string;
  leave_type_id: string;
  leaveType?: LeaveTypeCatalogItem;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
};

export type LeaveAssignmentPayload = {
  leave_type_id: string;
  allocated_days?: number;
  used_days?: number;
};

// ---- Documents -------------------------------------------------------------

/**
 * A stored attachment. Mirrors Backend/src/employee-documents/employee-document.entity.ts.
 *
 * `stored_name` is the UUID filename on disk; `original_name` is what the user
 * picked and what the UI shows. The two are separate so an upload named
 * `../../etc/passwd` cannot influence where the bytes land.
 */
export type EmployeeDocument = {
  document_id: string;
  employeeId: string;
  category: string;
  original_name: string;
  stored_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by?: string | null;
  uploaded_at: string;
};

// ---- Request payloads ------------------------------------------------------

/**
 * POST /users. `employee_code` is optional: leave it blank and the service
 * generates the next TC-EMP-NNN inside a locked transaction; supply a custom
 * one and it is used as-is after a uniqueness check.
 */
export type CreateEmployeePayload = {
  employee_code?: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  phone: string;
  date_of_birth: string;
  gender: string;
  profile_image?: string;
  /** 128px WebP derivative of `profile_image`, for small renderings. */
  profile_image_thumb?: string;
  blood_group?: string;

  // Single free-text address (the structured parts were merged into it).
  address?: string;

  joining_date: string;
  employee_type: string;
  department_id: string;
  designation_id: string;
  job_category_id: string;
  shift_id: string;
  team_lead_id?: string;

  role_id: string;
  status?: boolean;

  leave_assignments?: LeaveAssignmentPayload[];

  salary: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_routing_code?: string;
  is_overtime?: boolean;

  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
};

/**
 * PATCH /users/:id — every field optional (UpdateUserDto extends
 * PartialType(CreateUserDto)), minus `password`: credential changes go through
 * POST /users/:id/reset-password so they are separately permissioned and
 * audited. `employee_code` is editable here, the same as on create.
 */
export type UpdateEmployeePayload = Partial<
  Omit<CreateEmployeePayload, 'password' | 'team_lead_id'>
> & {
  employee_code?: string;
  /**
   * `null` explicitly clears the team lead; `undefined` leaves it untouched.
   * The backend's mapScalars distinguishes the two, so the form sends `null`
   * when the user picks "no team lead" rather than omitting the field.
   *
   * `team_lead_id` is omitted from the base `CreateEmployeePayload` above so
   * this `string | null` type applies as-is: intersecting it with the base's
   * `string` would collapse back to `string` and drop the `null`.
   */
  team_lead_id?: string | null;
};

/** PATCH /users/:id/account-settings */
export type AccountSettingsPayload = {
  login_enabled?: boolean;
  password_reset_allowed?: boolean;
  web_login_allowed?: boolean;
  mobile_login_allowed?: boolean;
  api_access_allowed?: boolean;
  multi_device_login_allowed?: boolean;
  remote_attendance_allowed?: boolean;
  biometric_attendance_allowed?: boolean;
  is_overtime?: boolean;
  status?: boolean;
};

/** PATCH /users/me/profile — the self-service allow-list. */
export type UpdateOwnProfilePayload = {
  phone?: string;
  profile_image?: string;
  /** 128px WebP derivative of `profile_image`, for small renderings. */
  profile_image_thumb?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  /** Applied only when the caller holds employees.profile.email.edit. */
  email?: string;
};

export type ChangeOwnPasswordPayload = {
  current_password: string;
  new_password: string;
};

export type ResetPasswordPayload = { new_password: string };

// ---- List query -----------------------------------------------------------

export type EmployeeListQuery = {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: EmployeeSortField;
  sortOrder?: 'ASC' | 'DESC';
  /** Narrows to a single user — the Team Leads tab's "one lead" filter. */
  user_id?: string;
  department_id?: string;
  designation_id?: string;
  role_id?: string;
  shift_id?: string;
  job_category_id?: string;
  team_lead_id?: string;
  employee_type?: string;
  status?: boolean;
  team_leads_only?: boolean;
  include_team_count?: boolean;
};

// ---- Helpers --------------------------------------------------------------

export const fullName = (e: {
  first_name?: string;
  last_name?: string;
}): string => [e.first_name, e.last_name].filter(Boolean).join(' ').trim();

/**
 * Resolves a stored photo path to a loadable URL.
 *
 * The backend stores a server-relative path like
 * `/uploads/employee-photos/abc.webp` and serves it from the API origin, not
 * the Vite dev-server origin — so a bare path would 404 in development. Absolute
 * URLs and data: URIs (an unsaved local preview) are passed through untouched.
 */
export function photoUrl(
  path: string | null | undefined,
  apiBaseUrl: string,
): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  const origin = apiBaseUrl.replace(/\/api\/?$/, '');
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Resolves a stored document's on-disk name to a loadable URL.
 *
 * The bytes live under `uploads/employee-documents/<stored_name>` and are served
 * statically at `/uploads/...` (mounted before the `/api` prefix), the same way
 * profile photos are — so the file is reachable by a plain link without a bearer
 * token. `stored_name` is a generated UUID, never the uploader's filename.
 */
export function documentUrl(
  storedName: string | null | undefined,
  apiBaseUrl: string,
): string | undefined {
  if (!storedName) return undefined;
  return photoUrl(`/uploads/employee-documents/${storedName}`, apiBaseUrl);
}
