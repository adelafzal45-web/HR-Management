// API modules for the Phase 2 Settings workspace: Company Details,
// Departments, Designations, Roles, Permissions, Branding.
//
// Same contract as authApi/hrApi: every call tries the real NestJS backend
// first (apiRequest — pings /health, attaches the JWT), and only falls back
// to the in-memory mock store (settingsMockData.ts) when the backend is
// completely unreachable. Real backend errors (validation, conflicts, etc.)
// are never swallowed — only "can't reach the API at all" triggers the
// fallback, so every screen behaves identically in demo mode or wired up
// to a real backend.
//
// Confirmed against the live Swagger doc (full CRUD, incl. PATCH, each):
//   /designations, /job-categories, /shifts, /attendance, /leave-requests
// Confirmed but with NO update route on the backend (POST/GET/GET :id/DELETE
// only — no PATCH controller method exists yet, so update() below will
// always 404 → gracefully degrade to demo data via the 404 handler in
// api.ts until the backend adds one):
//   /departments, /roles
// Confirmed, list/create/GET :id/delete only (no PATCH at all):
//   /permissions
// Confirmed, list/create/delete only (no GET :id, no PATCH):
//   /role-permissions
// Not in the Swagger doc at all yet — no backend route exists, so these
// always fall back to demo data:
//   /settings/company, /settings/branding
//
// IMPORTANT — field naming mismatches confirmed against the live Swagger doc.
// Several DTOs on this backend are snake_case and/or use different key names
// than the rest of this app's camelCase `name` convention. Every module below
// converts to/from the wire shape at the request boundary so the rest of the
// frontend (types, forms, tables) can keep using one consistent camelCase
// shape:
//   - POST /departments    body: { department_name, description }  (no
//     status field in the documented DTO — the Status toggle in the UI is
//     kept for UX consistency, but isn't sent/persisted until the backend
//     adds one)
//   - POST /job-categories body: { job_category_name, description }  (same
//     caveat re: status — not part of the documented DTO)
//   - GET  /designations   items: { designation_id, title }  — note the
//     field is `title`, not `name`/`designation_name`, and the confirmed
//     response shape has no department reference or description/status
//     fields. designationsApi below cross-references the Departments list
//     client-side to populate `departmentName` for the table. The create/
//     update payload's exact field names for `department_id`/`description`
//     aren't confirmed by a working example yet (the Swagger "Try it out"
//     example body is empty and 500s) — `title` + `department_id` +
//     `description` is our best-effort guess following this backend's
//     snake_case convention; adjust here first if the real DTO differs.
//   - /shifts: CreateShiftDto example uses snake_case (shift_name,
//     start_time, end_time, grace_period_minutes), unlike every other DTO in
//     this app which is camelCase.
//   - POST /roles       body: { role_name, description }  — no status and
//     no permissions in the DTO; permission assignment is a separate join
//     table (see below).
//   - POST /permissions body: { permission_name, description }  — no
//     `module`/grouping field at all; the UI's "module" grouping is derived
//     client-side from `permission_name` and never sent to the backend.
//   - POST /role-permissions body: { roleId, permissionId }  — camelCase,
//     unlike role_name/permission_name above. This is the real join table
//     behind the Roles screen's permission checkboxes: create/update there
//     diff the desired permissionIds against GET /role-permissions and issue
//     individual POST (assign) / DELETE (unassign) calls.

import { apiRequest, withDemoFallback, normalizeListResult } from "./api";
import {
  mockDepartmentsApi,
  mockDesignationsApi,
  mockJobCategoriesApi,
  mockShiftsApi,
  mockPermissionsApi,
  mockRolesApi,
  mockCompanyDetailsApi,
  mockBrandingApi,
  type EntityStatus,
  type Department,
  type Designation,
  type JobCategory,
  type Shift,
  type Permission,
  type Role,
  type CompanyDetails,
  type BrandingSettingsRecord,
  type ListParams,
  type ListResult,
} from "./settingsMockData";

export type {
  Department,
  Designation,
  JobCategory,
  Shift,
  Permission,
  Role,
  CompanyDetails,
  ListParams,
  ListResult,
  EntityStatus,
} from "./settingsMockData";
export type BrandingSettings = BrandingSettingsRecord;

const qs = (params: ListParams) => {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const str = search.toString();
  return str ? `?${str}` : "";
};

// ---- Departments — GET/POST/GET :id/DELETE /departments -------------------
// Confirmed live Swagger DTO: { department_name, description } — snake_case,
// and no PATCH route is documented (list only shows POST / GET / GET :id /
// DELETE), so update() below is expected to 404 → gracefully falls back to
// the mock store until the backend adds a PATCH controller method.
type ApiDepartment = {
  department_id?: string;
  id?: string;
  department_name: string;
  description?: string | null;
  status?: EntityStatus;
  created_at?: string;
  createdAt?: string;
};

const toApiDepartmentPayload = (payload: Pick<Department, "name" | "description">) => ({
  department_name: payload.name,
  description: payload.description,
});

const fromApiDepartment = (raw: ApiDepartment): Department => ({
  departmentId: raw.department_id ?? raw.id ?? "",
  name: raw.department_name,
  description: raw.description ?? "",
  // status isn't part of the documented DTO yet — default so the UI still renders.
  status: raw.status ?? "active",
  createdAt: raw.created_at ?? raw.createdAt ?? "",
});

export const departmentsApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Department>>(
      () =>
        apiRequest<unknown>(`/departments${qs(params)}`).then((raw) => {
          const normalized = normalizeListResult<ApiDepartment>(raw);
          return { data: normalized.data.map(fromApiDepartment), total: normalized.total };
        }),
      () => mockDepartmentsApi.list(params),
    ),

  create: (payload: Pick<Department, "name" | "description" | "status">) =>
    withDemoFallback<Department>(
      () =>
        apiRequest<ApiDepartment>("/departments", {
          method: "POST",
          body: toApiDepartmentPayload(payload),
        }).then(fromApiDepartment),
      () => mockDepartmentsApi.create(payload),
    ),

  update: (id: string, payload: Pick<Department, "name" | "description" | "status">) =>
    withDemoFallback<Department>(
      () =>
        apiRequest<ApiDepartment>(`/departments/${id}`, {
          method: "PATCH",
          body: toApiDepartmentPayload(payload),
        }).then(fromApiDepartment),
      () => mockDepartmentsApi.update(id, payload),
    ),

  remove: (id: string) =>
    withDemoFallback<{ departmentId: string }>(
      () => apiRequest<{ departmentId: string }>(`/departments/${id}`, { method: "DELETE" }),
      () => mockDepartmentsApi.remove(id),
    ),

  // Lightweight lookup used to populate the "Department" dropdown on the
  // Designation form — always resolves from the currently-known list.
  listAll: () =>
    withDemoFallback<ListResult<Department>>(
      () =>
        apiRequest<unknown>(`/departments?pageSize=1000`).then((raw) => {
          const normalized = normalizeListResult<ApiDepartment>(raw);
          return { data: normalized.data.map(fromApiDepartment), total: normalized.total };
        }),
      () => Promise.resolve({ data: mockDepartmentsApi.listAll(), total: mockDepartmentsApi.listAll().length }),
    ),
};

// ---- Designations — GET/POST/PATCH/DELETE /designations -------------------
// Confirmed live Swagger response shape for GET /designations items:
//   { designation_id, title } — note the field is `title`, not `name` or
// `designation_name`, and there's no department reference, description, or
// status in the confirmed example. Since the table/form need a department
// name, list()/listAll-backed lookups below cross-reference the Departments
// list client-side. The create/update payload field names beyond `title`
// (department_id / description) aren't confirmed by a working example (the
// Swagger "Try it out" request body is empty and currently 500s) — adjust
// toApiDesignationPayload first if the real DTO turns out to differ.
type ApiDesignation = {
  designation_id?: string;
  id?: string;
  title: string;
  department_id?: string;
  department_name?: string;
  description?: string | null;
  status?: EntityStatus;
  created_at?: string;
  createdAt?: string;
};

const toApiDesignationPayload = (payload: Pick<Designation, "name" | "departmentId" | "description">) => ({
  title: payload.name,
  department_id: payload.departmentId,
  description: payload.description,
});

const fromApiDesignation = (raw: ApiDesignation, departmentsById: Map<string, Department>): Designation => {
  const departmentId = raw.department_id ?? "";
  return {
    designationId: raw.designation_id ?? raw.id ?? "",
    name: raw.title,
    departmentId,
    departmentName: raw.department_name ?? departmentsById.get(departmentId)?.name ?? "—",
    description: raw.description ?? "",
    // status isn't part of the confirmed DTO yet — default so the UI still renders.
    status: raw.status ?? "active",
    createdAt: raw.created_at ?? raw.createdAt ?? "",
  };
};

// The confirmed GET /designations response has no department info attached,
// so every read pulls the Departments list alongside it to resolve names.
const departmentLookup = () =>
  departmentsApi.listAll().then(
    (res) => new Map(res.data.map((d) => [d.departmentId, d])),
    () => new Map<string, Department>(),
  );

export const designationsApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Designation>>(
      () =>
        Promise.all([apiRequest<unknown>(`/designations${qs(params)}`), departmentLookup()]).then(
          ([raw, deptMap]) => {
            const normalized = normalizeListResult<ApiDesignation>(raw);
            return { data: normalized.data.map((d) => fromApiDesignation(d, deptMap)), total: normalized.total };
          },
        ),
      () => mockDesignationsApi.list(params),
    ),

  create: (payload: Pick<Designation, "name" | "departmentId" | "description" | "status">) =>
    withDemoFallback<Designation>(
      () =>
        Promise.all([
          apiRequest<ApiDesignation>("/designations", { method: "POST", body: toApiDesignationPayload(payload) }),
          departmentLookup(),
        ]).then(([raw, deptMap]) => fromApiDesignation(raw, deptMap)),
      () => mockDesignationsApi.create(payload),
    ),

  update: (id: string, payload: Pick<Designation, "name" | "departmentId" | "description" | "status">) =>
    withDemoFallback<Designation>(
      () =>
        Promise.all([
          apiRequest<ApiDesignation>(`/designations/${id}`, {
            method: "PATCH",
            body: toApiDesignationPayload(payload),
          }),
          departmentLookup(),
        ]).then(([raw, deptMap]) => fromApiDesignation(raw, deptMap)),
      () => mockDesignationsApi.update(id, payload),
    ),

  remove: (id: string) =>
    withDemoFallback<{ designationId: string }>(
      () => apiRequest<{ designationId: string }>(`/designations/${id}`, { method: "DELETE" }),
      () => mockDesignationsApi.remove(id),
    ),
};

// ---- Job Categories — GET/POST/PATCH/DELETE /job-categories ---------------
// Confirmed live Swagger DTO: { job_category_name, description } — snake_case.
type ApiJobCategory = {
  job_category_id?: string;
  id?: string;
  job_category_name: string;
  description?: string | null;
  status?: EntityStatus;
  created_at?: string;
  createdAt?: string;
};

const toApiJobCategoryPayload = (payload: Pick<JobCategory, "name" | "description">) => ({
  job_category_name: payload.name,
  description: payload.description,
});

const fromApiJobCategory = (raw: ApiJobCategory): JobCategory => ({
  jobCategoryId: raw.job_category_id ?? raw.id ?? "",
  name: raw.job_category_name,
  description: raw.description ?? "",
  // status isn't part of the documented DTO yet — default so the UI still renders.
  status: raw.status ?? "active",
  createdAt: raw.created_at ?? raw.createdAt ?? "",
});

export const jobCategoriesApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<JobCategory>>(
      () =>
        apiRequest<unknown>(`/job-categories${qs(params)}`).then((raw) => {
          const normalized = normalizeListResult<ApiJobCategory>(raw);
          return { data: normalized.data.map(fromApiJobCategory), total: normalized.total };
        }),
      () => mockJobCategoriesApi.list(params),
    ),

  create: (payload: Pick<JobCategory, "name" | "description" | "status">) =>
    withDemoFallback<JobCategory>(
      () =>
        apiRequest<ApiJobCategory>("/job-categories", {
          method: "POST",
          body: toApiJobCategoryPayload(payload),
        }).then(fromApiJobCategory),
      () => mockJobCategoriesApi.create(payload),
    ),

  update: (id: string, payload: Pick<JobCategory, "name" | "description" | "status">) =>
    withDemoFallback<JobCategory>(
      () =>
        apiRequest<ApiJobCategory>(`/job-categories/${id}`, {
          method: "PATCH",
          body: toApiJobCategoryPayload(payload),
        }).then(fromApiJobCategory),
      () => mockJobCategoriesApi.update(id, payload),
    ),

  remove: (id: string) =>
    withDemoFallback<{ jobCategoryId: string }>(
      () => apiRequest<{ jobCategoryId: string }>(`/job-categories/${id}`, { method: "DELETE" }),
      () => mockJobCategoriesApi.remove(id),
    ),
};

// ---- Shifts — GET/POST/PATCH/DELETE /shifts --------------------------------
// Backend DTO is snake_case (see CreateShiftDto example in the Swagger doc):
//   { shift_name, start_time, end_time, grace_period_minutes, status }
// The rest of the app works with the camelCase `Shift` type, so we translate
// at the boundary — request bodies go out snake_case, responses come back
// through fromApiShift() into camelCase.
type ApiShift = {
  id?: string;
  shift_id?: string;
  shift_name: string;
  start_time: string;
  end_time: string;
  grace_period_minutes: number;
  status: EntityStatus;
  created_at?: string;
  createdAt?: string;
};

const toApiShiftPayload = (payload: Pick<Shift, "name" | "startTime" | "endTime" | "gracePeriodMinutes" | "status">) => ({
  shift_name: payload.name,
  start_time: payload.startTime,
  end_time: payload.endTime,
  grace_period_minutes: payload.gracePeriodMinutes,
  status: payload.status,
});

const fromApiShift = (raw: ApiShift): Shift => ({
  shiftId: raw.shift_id ?? raw.id ?? "",
  name: raw.shift_name,
  startTime: raw.start_time,
  endTime: raw.end_time,
  gracePeriodMinutes: raw.grace_period_minutes,
  status: raw.status,
  createdAt: raw.created_at ?? raw.createdAt ?? "",
});

export const shiftsApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Shift>>(
      () =>
        apiRequest<{ data: ApiShift[]; total: number } | ApiShift[]>(`/shifts${qs(params)}`).then((r) =>
          Array.isArray(r)
            ? { data: r.map(fromApiShift), total: r.length }
            : { data: r.data.map(fromApiShift), total: r.total },
        ),
      () => mockShiftsApi.list(params),
    ),

  create: (payload: Pick<Shift, "name" | "startTime" | "endTime" | "gracePeriodMinutes" | "status">) =>
    withDemoFallback<Shift>(
      () =>
        apiRequest<ApiShift>("/shifts", { method: "POST", body: toApiShiftPayload(payload) }).then(fromApiShift),
      () => mockShiftsApi.create(payload),
    ),

  update: (id: string, payload: Pick<Shift, "name" | "startTime" | "endTime" | "gracePeriodMinutes" | "status">) =>
    withDemoFallback<Shift>(
      () =>
        apiRequest<ApiShift>(`/shifts/${id}`, { method: "PATCH", body: toApiShiftPayload(payload) }).then(
          fromApiShift,
        ),
      () => mockShiftsApi.update(id, payload),
    ),

  remove: (id: string) =>
    withDemoFallback<{ shiftId: string }>(
      () => apiRequest<{ shiftId: string }>(`/shifts/${id}`, { method: "DELETE" }),
      () => mockShiftsApi.remove(id),
    ),
};

// ---- Permissions — GET/POST/GET :id/DELETE /permissions --------------------
// Confirmed live Swagger DTO (CreatePermissionDto): { permission_name,
// description } — snake_case, and there is NO `module`/`name` field on the
// backend at all. The UI still groups permissions into modules (e.g. "Users",
// "Payroll") for the Role picker, so `module` is derived client-side from
// `permission_name` (e.g. "CREATE_USER" -> "User", "users.manage" -> "Users")
// rather than being a real backend field — it's never sent, and is
// recomputed every time a permission comes back from the API.
type ApiPermission = {
  permission_id?: string;
  id?: string;
  permission_name: string;
  description?: string | null;
  created_at?: string;
  createdAt?: string;
};

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

function deriveModule(permissionName: string): string {
  const trimmed = (permissionName || "").trim();
  if (!trimmed) return "General";
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx > 0) return toTitleCase(trimmed.slice(0, dotIdx).replace(/[_-]/g, " "));
  const underscoreIdx = trimmed.indexOf("_");
  if (underscoreIdx > 0) return toTitleCase(trimmed.slice(underscoreIdx + 1).replace(/[_-]/g, " "));
  return toTitleCase(trimmed);
}

const toApiPermissionPayload = (payload: Pick<Permission, "name" | "description">) => ({
  permission_name: payload.name,
  description: payload.description,
});

const fromApiPermission = (raw: ApiPermission): Permission => ({
  permissionId: raw.permission_id ?? raw.id ?? "",
  name: raw.permission_name,
  module: deriveModule(raw.permission_name),
  description: raw.description ?? "",
});

export const permissionsApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Permission>>(
      () =>
        apiRequest<unknown>(`/permissions${qs(params)}`).then((raw) => {
          const normalized = normalizeListResult<ApiPermission>(raw);
          return { data: normalized.data.map(fromApiPermission), total: normalized.total };
        }),
      () => mockPermissionsApi.list(params),
    ),

  listAll: () =>
    withDemoFallback<Permission[]>(
      () =>
        apiRequest<unknown>(`/permissions?pageSize=1000`).then(
          (raw) => normalizeListResult<ApiPermission>(raw).data.map(fromApiPermission),
        ),
      () => mockPermissionsApi.listAll(),
    ),

  create: (payload: Pick<Permission, "name" | "description">) =>
    withDemoFallback<Permission>(
      () =>
        apiRequest<ApiPermission>("/permissions", {
          method: "POST",
          body: toApiPermissionPayload(payload),
        }).then(fromApiPermission),
      () => mockPermissionsApi.create({ ...payload, module: deriveModule(payload.name) }),
    ),

  remove: (id: string) =>
    withDemoFallback<{ permissionId: string }>(
      () => apiRequest<{ permissionId: string }>(`/permissions/${id}`, { method: "DELETE" }),
      () => mockPermissionsApi.remove(id),
    ),
};

// ---- Roles + Role-Permissions — /roles, /role-permissions ------------------
// Confirmed live Swagger DTOs:
//   CreateRoleDto:           { role_name, description }              (no status field)
//   CreateRolePermissionDto: { roleId, permissionId }                (camelCase, unlike role_name/description above)
// Confirmed routes:
//   /roles            -> POST, GET, GET :id, DELETE   (no PATCH — role_name/
//                         description edits below only affect the mock
//                         fallback until the backend adds an update route)
//   /role-permissions -> POST, GET, DELETE :id         (no GET :id, no PATCH)
// The form still presents "assign permissions to a role" as part of a single
// Role object, but under the hood this is a real join table: create/update
// below diff the role's desired `permissionIds` against `/role-permissions`
// and issue individual POST (assign) / DELETE (unassign) calls.
type ApiRole = {
  role_id?: string;
  id?: string;
  role_name: string;
  description?: string | null;
  status?: EntityStatus;
  created_at?: string;
  createdAt?: string;
};

type ApiRolePermission = {
  id?: string;
  role_permission_id?: string;
  roleId?: string;
  role_id?: string;
  permissionId?: string;
  permission_id?: string;
};

const rpId = (rp: ApiRolePermission) => rp.id ?? rp.role_permission_id ?? "";
const rpRoleId = (rp: ApiRolePermission) => rp.roleId ?? rp.role_id ?? "";
const rpPermissionId = (rp: ApiRolePermission) => rp.permissionId ?? rp.permission_id ?? "";

const toApiRolePayload = (payload: Pick<Role, "name" | "description">) => ({
  role_name: payload.name,
  description: payload.description,
});

const fromApiRole = (raw: ApiRole, permissionIds: string[]): Role => ({
  roleId: raw.role_id ?? raw.id ?? "",
  name: raw.role_name,
  description: raw.description ?? "",
  permissionIds,
  // status isn't part of the documented DTO — default so the UI still renders.
  status: raw.status ?? "active",
  createdAt: raw.created_at ?? raw.createdAt ?? "",
});

// Best-effort: the mapping list is needed to know which permissions belong
// to which role (roles themselves don't carry that). If it's unreachable,
// degrade to "no permissions known yet" rather than failing the whole call.
const fetchRolePermissions = () =>
  apiRequest<unknown>(`/role-permissions`)
    .then((raw) => normalizeListResult<ApiRolePermission>(raw).data)
    .catch(() => [] as ApiRolePermission[]);

export const rolesApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Role>>(
      async () => {
        const [raw, rolePermissions] = await Promise.all([apiRequest<unknown>(`/roles${qs(params)}`), fetchRolePermissions()]);
        const normalized = normalizeListResult<ApiRole>(raw);
        const data = normalized.data.map((r) => {
          const roleId = r.role_id ?? r.id ?? "";
          const permissionIds = rolePermissions.filter((rp) => rpRoleId(rp) === roleId).map(rpPermissionId);
          return fromApiRole(r, permissionIds);
        });
        return { data, total: normalized.total };
      },
      () => mockRolesApi.list(params),
    ),

  getById: (id: string) =>
    withDemoFallback<Role>(
      async () => {
        const [role, rolePermissions] = await Promise.all([apiRequest<ApiRole>(`/roles/${id}`), fetchRolePermissions()]);
        const permissionIds = rolePermissions.filter((rp) => rpRoleId(rp) === id).map(rpPermissionId);
        return fromApiRole(role, permissionIds);
      },
      () => mockRolesApi.getById(id),
    ),

  create: (payload: Pick<Role, "name" | "description" | "status" | "permissionIds">) =>
    withDemoFallback<Role>(
      async () => {
        const role = await apiRequest<ApiRole>("/roles", { method: "POST", body: toApiRolePayload(payload) });
        const roleId = role.role_id ?? role.id ?? "";
        await Promise.all(
          payload.permissionIds.map((permissionId) =>
            apiRequest("/role-permissions", { method: "POST", body: { roleId, permissionId } }),
          ),
        );
        return fromApiRole(role, payload.permissionIds);
      },
      () => mockRolesApi.create(payload),
    ),

  // No PATCH /roles route is documented, so this only reconciles the
  // role-permission join table (which is real and confirmed) against the
  // desired permissionIds. role_name/description edits made here won't
  // persist against a live backend until it gains an update route.
  update: (id: string, payload: Pick<Role, "name" | "description" | "status" | "permissionIds">) =>
    withDemoFallback<Role>(
      async () => {
        const [role, rolePermissions] = await Promise.all([apiRequest<ApiRole>(`/roles/${id}`), fetchRolePermissions()]);
        const existingForRole = rolePermissions.filter((rp) => rpRoleId(rp) === id);
        const existingPermissionIds = existingForRole.map(rpPermissionId);
        const toAdd = payload.permissionIds.filter((pid) => !existingPermissionIds.includes(pid));
        const toRemove = existingForRole.filter((rp) => !payload.permissionIds.includes(rpPermissionId(rp)));
        await Promise.all([
          ...toAdd.map((permissionId) => apiRequest("/role-permissions", { method: "POST", body: { roleId: id, permissionId } })),
          ...toRemove.map((rp) => apiRequest(`/role-permissions/${rpId(rp)}`, { method: "DELETE" })),
        ]);
        return fromApiRole(role, payload.permissionIds);
      },
      () => mockRolesApi.update(id, payload),
    ),

  remove: (id: string) =>
    withDemoFallback<{ roleId: string }>(
      async () => {
        // No documented cascade — best-effort clean up this role's
        // role-permission mappings first so they don't dangle.
        const rolePermissions = await fetchRolePermissions();
        const toRemove = rolePermissions.filter((rp) => rpRoleId(rp) === id);
        await Promise.all(toRemove.map((rp) => apiRequest(`/role-permissions/${rpId(rp)}`, { method: "DELETE" }).catch(() => undefined)));
        return apiRequest<{ roleId: string }>(`/roles/${id}`, { method: "DELETE" });
      },
      () => mockRolesApi.remove(id),
    ),
};

// ---- Company Details — GET/PATCH /settings/company -------------------------
export const companyDetailsApi = {
  get: () =>
    withDemoFallback<CompanyDetails>(
      () => apiRequest<CompanyDetails>("/settings/company"),
      () => mockCompanyDetailsApi.get(),
    ),

  update: (payload: CompanyDetails) =>
    withDemoFallback<CompanyDetails>(
      () => apiRequest<CompanyDetails>("/settings/company", { method: "PATCH", body: payload }),
      () => mockCompanyDetailsApi.update(payload),
    ),
};

// ---- Branding — GET/PATCH /settings/branding -------------------------------
export const brandingApi = {
  get: () =>
    withDemoFallback<BrandingSettings>(
      () => apiRequest<BrandingSettings>("/settings/branding"),
      () => mockBrandingApi.get(),
    ),

  update: (payload: BrandingSettings) =>
    withDemoFallback<BrandingSettings>(
      () => apiRequest<BrandingSettings>("/settings/branding", { method: "PATCH", body: payload }),
      () => mockBrandingApi.update(payload),
    ),
};
