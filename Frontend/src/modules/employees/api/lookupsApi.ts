// ============================================================================
// Reference-data lookups for the employee forms.
//
// The settings module already exposes departmentsApi/designationsApi/etc., but
// those return camelCase adapter models. The employee forms want the backend's
// own snake_case shapes, so this module reads the collections directly. A
// transport failure surfaces as an error the UI can render rather than a masked
// empty list, so a form never offers a fabricated department whose id the
// database has never heard of.
//
// Response shapes verified against the live API:
//   GET /departments    -> [{ department_id, department_name, description }]
//   GET /designations   -> [{ designation_id, title, department: {…} }]
//   GET /job-categories -> [{ job_category_id, job_category_name, description }]
//   GET /shifts         -> [{ shift_id, shift_name, start_time, end_time, … }]
//   GET /leave-types    -> [{ leave_type_id, name, is_paid, max_days_per_year… }]
// Each is a bare array, not a paginated envelope.
// ============================================================================

import { api, ENDPOINTS } from "@/lib/apiClient";
import type {
  DepartmentRef,
  DesignationRef,
  JobCategoryRef,
  LeaveTypeCatalogItem,
  RoleRef,
  ShiftRef,
} from "@/modules/employees/types/employee.types";

/** A designation carries its owning department, so the form can filter by it. */
export type DesignationOption = DesignationRef & {
  department?: DepartmentRef | null;
};

export type ShiftOption = ShiftRef & {
  start_time?: string;
  end_time?: string;
  status?: string;
};

/**
 * A role the caller is permitted to assign.
 *
 * `rolePermissions` comes back fully expanded. It is kept (rather than dropped
 * to just the name) because the account-settings panel needs to know which
 * permissions a role actually grants in order to disable toggles that the role
 * can never exercise.
 */
export type AssignableRole = RoleRef & {
  description?: string;
  rolePermissions?: {
    role_permission_id: string;
    permission: { permission_id: string; permission_name: string; description?: string };
  }[];
};

/** Permission names granted by a role, flattened for membership checks. */
export function permissionNamesOf(role: AssignableRole | undefined | null): string[] {
  if (!role?.rolePermissions) return [];
  return role.rolePermissions
    .map((rp) => rp.permission?.permission_name)
    .filter((name): name is string => Boolean(name));
}

export const lookupsApi = {
  departments: () => api.get<DepartmentRef[]>(ENDPOINTS.departments.base),
  designations: () => api.get<DesignationOption[]>(ENDPOINTS.designations.base),
  jobCategories: () => api.get<JobCategoryRef[]>(ENDPOINTS.jobCategories.base),
  shifts: () => api.get<ShiftOption[]>(ENDPOINTS.shifts.base),

  /** The full catalogue, including inactive types — callers filter as needed. */
  leaveTypes: () => api.get<LeaveTypeCatalogItem[]>(ENDPOINTS.leaveTypes.base),

  /**
   * Roles the signed-in user may grant. The backend returns only roles whose
   * permission set is a subset of the caller's own, so this list is already the
   * authoritative answer — the form must not widen it client-side.
   */
  assignableRoles: () => api.get<AssignableRole[]>(ENDPOINTS.users.assignableRoles),
};

/**
 * Loads everything the create/edit form needs in one round of parallel calls.
 *
 * `Promise.all` rather than sequential awaits: these are five independent
 * GETs and the form cannot render until all of them land, so serialising them
 * would multiply the perceived load time for no benefit.
 */
export async function loadFormLookups(): Promise<{
  departments: DepartmentRef[];
  designations: DesignationOption[];
  jobCategories: JobCategoryRef[];
  shifts: ShiftOption[];
  leaveTypes: LeaveTypeCatalogItem[];
  roles: AssignableRole[];
}> {
  const [departments, designations, jobCategories, shifts, leaveTypes, roles] =
    await Promise.all([
      lookupsApi.departments(),
      lookupsApi.designations(),
      lookupsApi.jobCategories(),
      lookupsApi.shifts(),
      lookupsApi.leaveTypes(),
      lookupsApi.assignableRoles(),
    ]);

  return { departments, designations, jobCategories, shifts, leaveTypes, roles };
}
