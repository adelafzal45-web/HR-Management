// ============================================================================
// Employee Management API — the real backend, nothing else.
//
// Deliberately does NOT use `withDemoFallback`. The legacy employeeApi.ts wraps
// every call so an unreachable backend silently yields mock rows; that is
// tolerable for a read-only dashboard widget and actively harmful here, because
// a "successful" create against the mock store reports an employee code that
// was never issued and an id that does not exist. Callers of this module get a
// real ApiError and render an error state.
//
// Every path below is a route that exists in Backend/src/users/users.controller.ts.
// ============================================================================

import { api, apiDownload, apiUpload, ENDPOINTS, saveBlob } from "@/lib/apiClient";
import type {
  AccountSettingsPayload,
  ChangeOwnPasswordPayload,
  CreateEmployeePayload,
  Employee,
  EmployeeDocument,
  EmployeeListQuery,
  LeaveAssignmentPayload,
  LeaveBalance,
  PaginatedResult,
  ResetPasswordPayload,
  UpdateEmployeePayload,
  UpdateOwnProfilePayload,
} from "@/modules/employees/types/employee.types";

/**
 * Serialises a list query, dropping empty values.
 *
 * The backend's EmployeeQueryDto runs with `whitelist: true`, so an unknown key
 * is stripped rather than rejected — but an empty `department_id=` would be
 * coerced and fail UUID validation with a 400. Omitting blanks entirely is what
 * keeps "no filter selected" from looking like "filter by nothing".
 */
function buildQuery(query: EmployeeListQuery = {}): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const str = params.toString();
  return str ? `?${str}` : "";
}

/** Empty page, for rendering an empty state without special-casing null. */
export const emptyPage = <T,>(limit = 10): PaginatedResult<T> => ({
  data: [],
  total: 0,
  page: 1,
  limit,
  totalPages: 0,
});

export const employeeService = {
  // ---- List / read ---------------------------------------------------------

  /** GET /users — server-side pagination, search, filters and sorting. */
  list: (query: EmployeeListQuery = {}) =>
    api.get<PaginatedResult<Employee>>(
      `${ENDPOINTS.users.base}${buildQuery(query)}`,
    ),

  /** GET /users/:id — includes role, department, designation, shift, job
   * category, team lead and leave balances. */
  get: (id: string) => api.get<Employee>(ENDPOINTS.users.byId(id)),

  /**
   * GET /users/team-leads — for the Team Lead dropdown.
   *
   * Passing no department returns every active lead; passing one returns only
   * that department's leads, which is what the form must use. The spec is
   * explicit that leads from other departments must never be offered.
   */
  teamLeads: (departmentId?: string) =>
    api.get<Employee[]>(
      `${ENDPOINTS.users.teamLeads}${departmentId ? `?department_id=${encodeURIComponent(departmentId)}` : ""}`,
    ),

  /** GET /users/:id/team — a lead's direct reports, paginated and searchable. */
  team: (id: string, query: EmployeeListQuery = {}) =>
    api.get<PaginatedResult<Employee>>(
      `${ENDPOINTS.users.team(id)}${buildQuery(query)}`,
    ),

  /** GET /users/:id/leave-balances — allocated, used and remaining days. */
  leaveBalances: (id: string) =>
    api.get<LeaveBalance[]>(ENDPOINTS.users.leaveBalances(id)),

  // ---- Write --------------------------------------------------------------

  /**
   * POST /users. The employee code is generated server-side inside a locked
   * transaction, so no code is sent.
   */
  create: (payload: CreateEmployeePayload) =>
    api.post<Employee>(ENDPOINTS.users.base, payload),

  /** PATCH /users/:id — the full HR edit, password excluded. */
  update: (id: string, payload: UpdateEmployeePayload) =>
    api.patch<Employee>(ENDPOINTS.users.byId(id), payload),

  /** DELETE /users/:id — detaches direct reports first, server-side. */
  remove: (id: string) =>
    api.delete<{ message?: string }>(ENDPOINTS.users.byId(id)),

  /**
   * PATCH /users/:id/account-settings — login, channel, device and attendance
   * flags plus employment status. Accepts a partial body so a single toggle can
   * be flipped without resending the rest.
   */
  updateAccountSettings: (id: string, payload: AccountSettingsPayload) =>
    api.patch<Employee>(ENDPOINTS.users.accountSettings(id), payload),

  /**
   * PATCH /users/:id/leave-types — replaces the whole assignment set.
   *
   * Types omitted from `assignments` are removed. Allocations for types already
   * present are updated in place, so `used_days` survives a re-save; that is
   * why the caller sends the complete desired state rather than a diff.
   */
  assignLeaveTypes: (id: string, assignments: LeaveAssignmentPayload[]) =>
    api.patch<LeaveBalance[]>(ENDPOINTS.users.leaveTypes(id), { assignments }),

  /** POST /users/:id/reset-password — administrative reset, no current password. */
  resetPassword: (id: string, payload: ResetPasswordPayload) =>
    api.post<{ message?: string }>(ENDPOINTS.users.resetPassword(id), payload),

  // ---- Photo --------------------------------------------------------------

  /**
   * POST /users/:id/photo (multipart).
   *
   * The field name must be `file` — that is what the controller's
   * FileInterceptor binds to. Returns the updated employee with the stored
   * `profile_image` path, so the caller can re-render from the response rather
   * than guessing the URL.
   */
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiUpload<Employee>(ENDPOINTS.users.photo(id), form);
  },

  /** DELETE /users/:id/photo — clears the stored image. */
  removePhoto: (id: string) =>
    api.delete<Employee>(ENDPOINTS.users.photo(id)),

  // ---- Documents ----------------------------------------------------------

  /**
   * POST /users/:id/documents (multipart).
   *
   * Files are sent under the `files` field, with a matching `categories` array
   * entry per file. The backend validates against magic bytes and stores them
   * with UUID names in `uploads/employee-documents/`.
   */
  uploadDocuments: (id: string, files: File[], categories: string[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    categories.forEach((cat) => form.append("categories", cat));
    return apiUpload<EmployeeDocument[]>(ENDPOINTS.users.documents(id), form);
  },

  /** GET /users/:id/documents — metadata only, ordered newest first. */
  listDocuments: (id: string) =>
    api.get<EmployeeDocument[]>(ENDPOINTS.users.documents(id)),

  /** DELETE /users/:id/documents/:documentId */
  deleteDocument: (id: string, documentId: string) =>
    api.delete<{ success: boolean }>(ENDPOINTS.users.documentById(id, documentId)),

  /**
   * POST /users/documents/export — downloads a zip of every document belonging
   * to the given employees. Folders are named by employee code and category.
   */
  exportDocuments: async (employeeIds: string[]) => {
    const today = new Date().toISOString().slice(0, 10);
    const blob = await apiDownload(ENDPOINTS.users.documentsExport, {
      method: "POST",
      body: JSON.stringify({ employeeIds }),
    });
    saveBlob(blob, `employee-documents-${today}.zip`);
  },
};

// ============================================================================
// Self-service. Every route is authenticated but needs no `employees.*`
// permission: an employee may always read and edit their own allowed fields.
// The backend enforces the allow-list, so anything extra sent here is dropped
// server-side rather than trusted.
// ============================================================================

export const myProfileService = {
  /** GET /users/me/profile */
  get: () => api.get<Employee>(ENDPOINTS.users.me.profile),

  /** GET /users/me/leave-balances */
  leaveBalances: () => api.get<LeaveBalance[]>(ENDPOINTS.users.me.leaveBalances),

  /** GET /users/me/team — empty page for someone who leads nobody. */
  team: (query: EmployeeListQuery = {}) =>
    api.get<PaginatedResult<Employee>>(
      `${ENDPOINTS.users.me.team}${buildQuery(query)}`,
    ),

  /**
   * PATCH /users/me/profile — photo, phone, address, emergency contact, and
   * email only when policy allows it. HR-controlled fields are discarded by the
   * backend even if present in the body.
   */
  update: (payload: UpdateOwnProfilePayload) =>
    api.patch<Employee>(ENDPOINTS.users.me.profile, payload),

  /** POST /users/me/change-password — requires the current password. */
  changePassword: (payload: ChangeOwnPasswordPayload) =>
    api.post<{ message?: string }>(ENDPOINTS.users.me.changePassword, payload),

  uploadPhoto: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiUpload<Employee>(ENDPOINTS.users.me.photo, form);
  },

  removePhoto: () => api.delete<Employee>(ENDPOINTS.users.me.photo),
};
