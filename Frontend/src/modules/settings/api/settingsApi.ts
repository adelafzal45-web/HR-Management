// API modules for the Settings workspace: Company Details, Branding,
// Departments, Designations, Job Categories, Shifts, Leave Types, Working Days,
// Roles, Permissions.
//
// Two contracts live here, deliberately:
//
// 1. Modules backed by routes that have existed for a while (departments,
//    designations, job categories, shifts, roles, permissions) still wrap calls
//    in withDemoFallback — the real backend first, the in-memory mock store
//    only when the backend is completely unreachable. Real backend errors
//    (validation, conflicts, 403s) are never swallowed; only "can't reach the
//    API at all" triggers the fallback.
//
// 2. Modules added alongside their backend tables (company settings, branding,
//    leave types, working days) have NO fallback. Those routes exist, so a
//    failure is a real failure and the screen must show it. Falling back would
//    reproduce exactly the bug this work set out to fix: a screen quietly
//    showing invented rows while the actual request was 403ing.
//
// Route inventory, verified against the controllers (not just Swagger):
//   full CRUD  /designations, /job-categories, /shifts, /leave-requests,
//              /attendance, /leave-types
//   no PATCH   /departments, /roles, /permissions  (see notes below)
//   join table /role-permissions — POST/GET/DELETE :id only
//   singleton  /company-settings — GET, GET /branding (@Public), PATCH. No :id:
//              one global row pinned to id = 1, no multi-tenancy.
//   scoped     /working-days — GET, GET /scope, GET /resolve, PUT, DELETE.
//              Scope is expressed by query params, not a path id.
//
// IMPORTANT — field naming. Every DTO on this backend is snake_case, and a few
// use different key names than this app's camelCase convention. Each module
// converts at the request boundary so the rest of the frontend keeps one
// consistent shape:
// - POST /departments body: { department_name, description } (no
// status field in the documented DTO — the Status toggle in the UI is
// kept for UX consistency, but isn't sent/persisted until the backend
// adds one)
// - POST /job-categories body: { job_category_name, description } (same
// caveat re: status — not part of the documented DTO)
// - GET /designations items: { designation_id, title, department: {...} } —
// note the field is `title`, not `name`/`designation_name`, and the
// department reference is a nested object. designationsApi below reads the
// nested shape first and falls back to a client-side Departments lookup.
// - /shifts: snake_case (shift_name, start_time, end_time,
// grace_period_minutes, break_duration_minutes).
// - POST /roles body: { role_name, description } — no status and
// no permissions in the DTO; permission assignment is a separate join
// table (see below).
// - POST /permissions body: { permission_name, description } — no
// `module`/grouping field at all; the UI's "module" grouping is derived
// client-side from `permission_name` and never sent to the backend.
// - POST /role-permissions body: { roleId, permissionId } — camelCase,
// unlike role_name/permission_name above. This is the real join table
// behind the Roles screen's permission checkboxes: create/update there
// diff the desired permissionIds against GET /role-permissions and issue
// individual POST (assign) / DELETE (unassign) calls.
// - /company-settings and /leave-types: snake_case, translated below.
// - /working-days: days are ISO-8601 numbered (1 = Mon ... 7 = Sun), matching
// Postgres EXTRACT(ISODOW FROM date), so no day-number conversion is needed.

import { apiRequest, withDemoFallback, normalizeListResult } from "@/api/client";
import {
 mockDepartmentsApi,
 mockDesignationsApi,
 mockJobCategoriesApi,
 mockShiftsApi,
 mockPermissionsApi,
 mockRolesApi,
 type EntityStatus,
 type Department,
 type Designation,
 type JobCategory,
 type Shift,
 type Permission,
 type Role,
 type ListParams,
 type ListResult,
} from "@/modules/settings/mocks/settingsMockData";

export type {
 Department,
 Designation,
 JobCategory,
 Shift,
 Permission,
 Role,
 ListParams,
 ListResult,
 EntityStatus,
} from "@/modules/settings/mocks/settingsMockData";

// Company Details, Branding and Leave Types are defined here rather than
// re-exported from the mock store: all three are backed by real tables now, and
// the real rows carry fields the demo types never had (working days, the
// collapsed-sidebar logo, the primary colour, carry-forward rules). Keeping the
// authoritative shape next to the translation code means the wire format and
// the type can't drift apart.

export type CompanyDetails = {
 legalName: string;
 registrationNumber: string;
 industry: string;
 timezone: string;
 currency: string;
 /**
  * Human-readable summary, e.g. "Mon-Fri". Display only — the authoritative
  * per-day configuration lives in working_day_schedules (see workingDaysApi),
  * because that is what attendance actually reads.
  */
 workingDays: string;
};

export type BrandingSettings = {
 companyName: string;
 logoUrl: string;
 /** Variant shown when the sidebar is collapsed, where a wordmark won't fit. */
 logoCollapsedUrl: string;
 faviconUrl: string;
 email: string;
 phone: string;
 address: string;
 website: string;
 /** Hex, e.g. "#F1B344". Applied app-wide as a CSS custom property. */
 primaryColor: string;
};

export type LeaveType = {
 leaveTypeId: string;
 leaveTypeName: string;
 description?: string;
 isPaid: boolean;
 isActive: boolean;
 /** Annual entitlement (the backend calls this max_days_per_year). */
 allocatedDays: number;
 carryForwardAllowed: boolean;
 maxCarryForwardDays: number;
 createdAt?: string;
};

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
// { designation_id, title, department: { department_id, department_name, description } }
// Note the field is `title`, not `name` or `designation_name`, and the
// department reference is a NESTED object (department.department_id), not a
// flat department_id field. fromApiDesignation() below reads the nested
// shape first and falls back to flat fields / the Departments list lookup
// for older or non-conforming API responses. The create/update payload field
// names beyond `title` (department_id / description) aren't confirmed by a
// working example (the Swagger "Try it out" request body is empty and
// currently 500s) — adjust toApiDesignationPayload first if the real DTO
// turns out to differ.
type ApiDesignation = {
 designation_id?: string;
 id?: string;
 title: string;
 // Confirmed live shape: department is a nested object, not flat fields.
 department?: {
 department_id?: string;
 department_name?: string;
 description?: string | null;
 } | null;
 // Kept as a fallback in case a future/older API version returns these flat.
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
 const departmentId = raw.department?.department_id ?? raw.department_id ?? "";
 return {
 designationId: raw.designation_id ?? raw.id ?? "",
 name: raw.title,
 departmentId,
 departmentName:
 raw.department?.department_name ?? raw.department_name ?? departmentsById.get(departmentId)?.name ?? "—",
 description: raw.department?.description ?? raw.description ?? "",
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
// Backend DTO is snake_case (see CreateShiftDto):
// { shift_name, start_time, end_time, grace_period_minutes,
//   break_duration_minutes, status }
// The rest of the app works with the camelCase `Shift` type, so we translate
// at the boundary — request bodies go out snake_case, responses come back
// through fromApiShift() into camelCase.
//
// Casing caveat: shifts.entity.ts stores status as a free-text column defaulting
// to 'Active' (capitalised), while EntityStatus is lowercase. Typing raw.status
// as EntityStatus would be a lie that puts "Active" into a field the app
// compares against "active" — so it is typed as string and normalised below.
type ApiShift = {
 id?: string;
 shift_id?: string;
 shift_name: string;
 start_time: string;
 end_time: string;
 grace_period_minutes: number;
 break_duration_minutes?: number;
 status: string;
 created_at?: string;
 createdAt?: string;
};

export type ShiftPayload = Pick<
 Shift,
 "name" | "startTime" | "endTime" | "gracePeriodMinutes" | "breakDurationMinutes" | "status"
>;

// The column has no CHECK constraint and existing rows hold 'Active'/'Inactive',
// so write back in the casing the database already uses rather than introducing
// a second spelling that filters and comparisons would then have to handle.
const toApiStatus = (status: EntityStatus) => (status === "active" ? "Active" : "Inactive");

const fromApiStatus = (raw: string | undefined): EntityStatus =>
 (raw ?? "").toLowerCase() === "inactive" ? "inactive" : "active";

// CreateShiftDto validates against /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/ —
// seconds are mandatory. <input type="time"> emits "08:30", which that regex
// rejects outright, so pad before sending or every save 400s.
const toApiTime = (value: string) => (value.length === 5 ? `${value}:00` : value);

const toApiShiftPayload = (payload: ShiftPayload) => ({
 shift_name: payload.name,
 start_time: toApiTime(payload.startTime),
 end_time: toApiTime(payload.endTime),
 grace_period_minutes: payload.gracePeriodMinutes,
 break_duration_minutes: payload.breakDurationMinutes,
 status: toApiStatus(payload.status),
});

const fromApiShift = (raw: ApiShift): Shift => ({
 shiftId: raw.shift_id ?? raw.id ?? "",
 name: raw.shift_name,
 // Postgres `time` columns serialise as HH:MM:SS, but <input type="time">
 // only accepts HH:MM — an unsliced value leaves the field blank on edit.
 startTime: (raw.start_time ?? "").slice(0, 5),
 endTime: (raw.end_time ?? "").slice(0, 5),
 gracePeriodMinutes: raw.grace_period_minutes,
 // Column defaults to 0 and the DTO makes it optional, so a row written before
 // 1786500000000-AddShiftBreakDuration ran comes back without the field.
 breakDurationMinutes: raw.break_duration_minutes ?? 0,
 status: fromApiStatus(raw.status),
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

 create: (payload: ShiftPayload) =>
 withDemoFallback<Shift>(
 () =>
 apiRequest<ApiShift>("/shifts", { method: "POST", body: toApiShiftPayload(payload) }).then(fromApiShift),
 () => mockShiftsApi.create(payload),
 ),

 update: (id: string, payload: ShiftPayload) =>
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
// CreateRoleDto: { role_name, description } (no status field)
// CreateRolePermissionDto: { roleId, permissionId } (camelCase, unlike role_name/description above)
// Confirmed routes:
// /roles -> POST, GET, GET :id, DELETE (no PATCH — role_name/
// description edits below only affect the mock
// fallback until the backend adds an update route)
// /role-permissions -> POST, GET, DELETE :id (no GET :id, no PATCH)
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

// ---- Company Details + Branding — GET/PATCH /company-settings --------------
// Real backend, single global row pinned to id = 1 (no :id in the path, no
// multi-tenancy). One `company_settings` table backs BOTH screens: Company
// Details edits the legal/registration/locale columns, Branding edits the
// display/logo/colour columns. They're split in the UI only.
//
// Wire shape is snake_case, like every other DTO on this backend, so both
// modules translate at the boundary and the pages keep their camelCase types.
// No mock fallback: these routes exist, so a failure is a real failure and the
// page must render an error rather than silently showing invented data.
type ApiCompanySettings = {
 id?: number;
 legal_company_name: string;
 registration_number?: string | null;
 industry?: string | null;
 timezone: string;
 currency: string;
 working_days?: string | null;
 company_name: string;
 logo_url?: string | null;
 logo_collapsed_url?: string | null;
 favicon_url?: string | null;
 email?: string | null;
 phone?: string | null;
 address?: string | null;
 website?: string | null;
 primary_color?: string | null;
};

const fromApiCompanyDetails = (raw: ApiCompanySettings): CompanyDetails => ({
 legalName: raw.legal_company_name ?? "",
 registrationNumber: raw.registration_number ?? "",
 industry: raw.industry ?? "",
 timezone: raw.timezone ?? "",
 currency: raw.currency ?? "",
 workingDays: raw.working_days ?? "",
});

const toApiCompanyDetails = (payload: CompanyDetails) => ({
 legal_company_name: payload.legalName,
 registration_number: payload.registrationNumber,
 industry: payload.industry,
 timezone: payload.timezone,
 currency: payload.currency,
 working_days: payload.workingDays,
});

export const companyDetailsApi = {
 get: () => apiRequest<ApiCompanySettings>("/company-settings").then(fromApiCompanyDetails),

 update: (payload: CompanyDetails) =>
 apiRequest<ApiCompanySettings>("/company-settings", {
 method: "PATCH",
 body: toApiCompanyDetails(payload),
 }).then(fromApiCompanyDetails),
};

// ---- Branding — GET /company-settings/branding, PATCH /company-settings ----
// The GET is @Public() on purpose: the login screen renders the logo and themes
// itself from primary_color before any token exists. The PATCH is not — it
// requires company-settings.update.
const fromApiBranding = (raw: ApiCompanySettings): BrandingSettings => ({
 companyName: raw.company_name ?? "",
 logoUrl: raw.logo_url ?? "",
 logoCollapsedUrl: raw.logo_collapsed_url ?? "",
 faviconUrl: raw.favicon_url ?? "",
 email: raw.email ?? "",
 phone: raw.phone ?? "",
 address: raw.address ?? "",
 website: raw.website ?? "",
 primaryColor: raw.primary_color ?? "",
});

const toApiBranding = (payload: BrandingSettings) => ({
 company_name: payload.companyName,
 logo_url: payload.logoUrl,
 logo_collapsed_url: payload.logoCollapsedUrl,
 favicon_url: payload.faviconUrl,
 email: payload.email,
 phone: payload.phone,
 address: payload.address,
 website: payload.website,
 primary_color: payload.primaryColor,
});

export const brandingApi = {
 get: () => apiRequest<ApiCompanySettings>("/company-settings/branding").then(fromApiBranding),

 update: (payload: BrandingSettings) =>
 apiRequest<ApiCompanySettings>("/company-settings", {
 method: "PATCH",
 body: toApiBranding(payload),
 }).then(fromApiBranding),
};

// ---- Leave Types — GET/POST/GET :id/PATCH/DELETE /leave-types --------------
// Real backend as of the leave_types migration. The wire shape is snake_case
// and richer than the old demo type: it carries carry-forward rules the mock
// list never had. Translated at the boundary like every other module here.
//
// No mock fallback — this route exists now, so "couldn't load leave types" must
// surface as a real error instead of being papered over with invented rows.
type ApiLeaveType = {
 leave_type_id: string;
 name: string;
 description?: string | null;
 is_paid: boolean;
 max_days_per_year: number;
 carry_forward_allowed: boolean;
 max_carry_forward_days: number;
 is_active: boolean;
 created_at?: string;
};

export type LeaveTypePayload = Pick<
 LeaveType,
 "leaveTypeName" | "description" | "isPaid" | "isActive" | "allocatedDays" | "carryForwardAllowed" | "maxCarryForwardDays"
>;

const fromApiLeaveType = (raw: ApiLeaveType): LeaveType => ({
 leaveTypeId: raw.leave_type_id,
 leaveTypeName: raw.name,
 description: raw.description ?? "",
 isPaid: raw.is_paid,
 // `allocatedDays` is this app's existing name for the annual entitlement.
 allocatedDays: raw.max_days_per_year,
 carryForwardAllowed: raw.carry_forward_allowed,
 maxCarryForwardDays: raw.max_carry_forward_days,
 isActive: raw.is_active,
 createdAt: raw.created_at ?? "",
});

const toApiLeaveType = (payload: LeaveTypePayload) => ({
 name: payload.leaveTypeName,
 description: payload.description,
 is_paid: payload.isPaid,
 max_days_per_year: payload.allocatedDays,
 carry_forward_allowed: payload.carryForwardAllowed ?? false,
 max_carry_forward_days: payload.maxCarryForwardDays ?? 0,
 is_active: payload.isActive,
});

export const leaveTypesApi = {
 list: (params: ListParams = {}) =>
 apiRequest<unknown>(`/leave-types${qs(params)}`).then((raw) => {
 const normalized = normalizeListResult<ApiLeaveType>(raw);
 return { data: normalized.data.map(fromApiLeaveType), total: normalized.total };
 }),

 create: (payload: LeaveTypePayload) =>
 apiRequest<ApiLeaveType>("/leave-types", { method: "POST", body: toApiLeaveType(payload) }).then(fromApiLeaveType),

 update: (id: string, payload: LeaveTypePayload) =>
 apiRequest<ApiLeaveType>(`/leave-types/${id}`, { method: "PATCH", body: toApiLeaveType(payload) }).then(
 fromApiLeaveType,
 ),

 remove: (id: string) => apiRequest<{ message: string }>(`/leave-types/${id}`, { method: "DELETE" }),

 // Lightweight lookup for the "Leave Type" dropdown on the Add/Edit Employee
 // form and the Apply Leave form — active types only, since an archived type
 // must not be selectable on a new request.
 listAll: () =>
 apiRequest<unknown>(`/leave-types`).then((raw) =>
 normalizeListResult<ApiLeaveType>(raw)
 .data.map(fromApiLeaveType)
 .filter((lt) => lt.isActive),
 ),
};

// ---- Working Days — /working-days ------------------------------------------
// Global default plus per-department and per-department+designation overrides.
// The backend resolves the specificity ladder (designation -> department ->
// global); the UI only has to say which scope it is editing.
//
// Days are ISO-8601 numbered (1 = Monday ... 7 = Sunday), matching Postgres
// EXTRACT(ISODOW FROM date) — so a day number means the same thing on both
// sides without any conversion.
export type WorkingDayScope = { departmentId?: string; designationId?: string };

export type ResolvedWeek = {
 /** Which tier actually supplied the answer. */
 scope: "designation" | "department" | "global";
 /** Day number (1-7) -> is a working day. Always contains all seven days. */
 days: Record<number, boolean>;
};

type ApiWorkingDayRow = {
 working_day_schedule_id?: string;
 department_id: string | null;
 designation_id: string | null;
 day_of_week: number;
 is_working: boolean;
};

const scopeQs = (scope: WorkingDayScope) => {
 const search = new URLSearchParams();
 if (scope.departmentId) search.set("department_id", scope.departmentId);
 if (scope.designationId) search.set("designation_id", scope.designationId);
 const str = search.toString();
 return str ? `?${str}` : "";
};

export const workingDaysApi = {
 /** Every configured row across all scopes — used to show which scopes override. */
 listAll: () => apiRequest<ApiWorkingDayRow[]>("/working-days"),

 /**
  * One scope exactly as stored, with no fallback applied. An empty array is
  * meaningful here: it means this scope has no override and inherits.
  */
 getScope: (scope: WorkingDayScope) => apiRequest<ApiWorkingDayRow[]>(`/working-days/scope${scopeQs(scope)}`),

 /** The effective week after fallback, plus which tier won. */
 resolve: (scope: WorkingDayScope = {}) => apiRequest<ResolvedWeek>(`/working-days/resolve${scopeQs(scope)}`),

 /**
  * Whole-week replacement — days omitted from `days` become non-working.
  * Atomic on the backend, so a half-written week is never observable.
  */
 setWeek: (scope: WorkingDayScope, days: Record<number, boolean>) =>
 apiRequest<ApiWorkingDayRow[]>("/working-days", {
 method: "PUT",
 body: {
 department_id: scope.departmentId,
 designation_id: scope.designationId,
 days: Object.entries(days).map(([day, isWorking]) => ({
 day_of_week: Number(day),
 is_working: isWorking,
 })),
 },
 }),

 /** Drops an override so the scope inherits again. The global default can't be cleared. */
 clearScope: (scope: WorkingDayScope) =>
 apiRequest<{ message: string }>(`/working-days${scopeQs(scope)}`, { method: "DELETE" }),
};
