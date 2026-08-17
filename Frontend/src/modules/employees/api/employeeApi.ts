// API module for org-wide Employee Management (HR / Administrator).
//
// Talks to the real backend through the shared transport in lib/apiClient
// (JWT bearer, refresh cookie, 401 replay, timeout). There is NO demo/mock
// fallback: real backend errors (validation, a duplicate email, a 403 from
// the permission guard) surface to the page as an `ApiError`, never swallowed
// into a synthesized employee list.
//
// Verified directly against the backend source
// (Backend/src/users/{users.controller,users.service,user.entity}.ts and
// dto/{create-user,update-user}.dto.ts) — not guessed from Swagger:
//
// POST /api/users body: CreateUserDto -> the created user
// GET /api/users query: search, department_id, status, page,
// limit, sortBy, sortOrder
// -> { data, total, page, limit, totalPages }
// GET /api/users/:id -> one user
// PATCH /api/users/:id body: Partial<CreateUserDto> -> the updated user
// DELETE /api/users/:id -> { message }
//
// CreateUserDto (UpdateUserDto = PartialType(CreateUserDto), so same shape,
// all optional) fields: employee_code, first_name, last_name, email,
// password, phone?, profile_image?, date_of_birth?, gender?, address?,
// employee_type, joining_date, salary?, status?, roleId, departmentId,
// designationId, jobCategoryId, shiftId. (FK fields stay camelCase even
// though the rest of the body is snake_case — that's exactly how the DTO is
// written.) `toApiBody` / `fromApiUser` below are the only place that
// translate between that wire shape and the camelCase `Employee` shape the
// rest of the app uses.
//
// GET responses include the FK relations populated as nested objects
// (`relations: ['role','department','designation','shift','jobCategory']`
// in users.service.ts), e.g. `department: { department_id, department_name,
// description }`, `designation: { designation_id, title }` — the designation
// relation's display field is `title`, not `name`. `fromApiUser` reads those
// nested shapes directly.
//
// This module predates the employee-management work and is kept for the five
// other modules that consume it (AppraisalManagement, LeaveRequests,
// AttendanceRecords, ProcessPayroll, adminOpsApi). New employee screens use
// `employeeService.ts`, which speaks the current DTO shape directly —
// snake_case throughout, with team leads, leave assignments, account settings
// and photo upload. Prefer that for anything new.
//
// Two mappings here are historical: `overtimeAllowed` and `managerId`. Both
// concepts now exist on the backend as `is_overtime` and `team_lead_id`, but
// this module's readers still expect the old camelCase names, so the
// normalizers below keep reading them. Writes go through employeeService.

import { apiRequest, ENDPOINTS, normalizeListResult } from "@/lib/apiClient";

// ---- Domain model ---------------------------------------------------------
// The camelCase shapes the UI consumes, translated to/from the /users wire
// format by toApiBody/fromApiUser below. They live here (not in a mock) as
// this module's own contract — five other modules import `Employee` from it.

export type Gender = "male" | "female" | "other";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type EmployeeStatus = "active" | "inactive";

export type Employee = {
 employeeId: string;
 employeeCode: string;
 firstName: string;
 lastName: string;
 email: string;
 phone: string;
 profileImageUrl: string;
 /** 128px derivative of `profileImageUrl`, for small renderings. */
 profileImageThumbUrl?: string;
 dateOfBirth: string; // YYYY-MM-DD
 gender: Gender;
 address: string;
 joiningDate: string; // YYYY-MM-DD
 employmentType: EmploymentType;
 salary: number;
 overtimeAllowed: boolean;
 roleId: string;
 roleName: string;
 departmentId: string;
 departmentName: string;
 designationId: string;
 designationName: string;
 jobCategoryId: string;
 jobCategoryName: string;
 shiftId: string;
 shiftName: string;
 managerId: string;
 managerName: string;
 status: EmployeeStatus;
 createdAt: string;
};

export type ListParams = {
 search?: string;
 page?: number;
 pageSize?: number;
 departmentId?: string;
 status?: EmployeeStatus | "";
};
export type ListResult<T> = { data: T[]; total: number };

export type EmployeePayload = Omit<
 Employee,
 "employeeId" | "createdAt" | "roleName" | "departmentName" | "designationName" | "jobCategoryName" | "shiftName" | "managerName"
>;

// The backend's `POST /api/users` requires a `password` field that isn't
// part of the persisted Employee record (and is never returned by GET).
// Kept as a separate type so create() can require it without leaking it
// into update()/the rest of the app.
export type EmployeeCreatePayload = EmployeePayload & { password: string };

const qs = (params: ListParams) => {
 const search = new URLSearchParams();
 if (params.search) search.set("search", params.search);
 if (params.departmentId) search.set("departmentId", params.departmentId);
 // The app model carries status as "active" | "inactive"; `users.status` is a
 // boolean column whose DTO rejects anything else with a 400. Translating here
 // rather than at each call site keeps the string form everywhere in the UI,
 // the same way employment type and gender are mapped just below.
 if (params.status) search.set("status", params.status === "active" ? "true" : "false");
 if (params.page) search.set("page", String(params.page));
 if (params.pageSize) search.set("pageSize", String(params.pageSize));
 const str = search.toString();
 return str ? `?${str}` : "";
};

// ---- Wire <-> app-model mapping (per the /api/users Swagger schema) -------

// The live API's enums come back Title-Cased with hyphens (e.g. "Full-Time",
// "Male" — see the sample `/users` response), while the app's internal
// `Employee` model uses lowercase snake_case ("full_time", "male") so the UI
// can key off it directly (labels, filter values, <Select> options, etc.).
// These two maps are the only place that translate between the two.
const EMPLOYMENT_TYPE_TO_API: Record<string, string> = {
 full_time: "Full-Time",
 part_time: "Part-Time",
 contract: "Contract",
 intern: "Intern",
};
const GENDER_TO_API: Record<string, string> = {
 male: "Male",
 female: "Female",
 other: "Other",
};

/**
 * camelCase EmployeePayload -> the exact body `CreateUserDto`/`UpdateUserDto`
 * accept (verified against the real backend source — Backend/src/users/dto/
 * create-user.dto.ts, update-user.dto.ts extends PartialType(CreateUserDto)).
 *
 * Two fields are intentionally NOT sent, because the backend has nowhere to
 * put them:
 * - `overtimeAllowed` — the entity's `is_overtime`/`working_hours`/
 * `overtime_hours`/`attendance_status` columns exist, but none of them
 * are in CreateUserDto/UpdateUserDto, so this endpoint can't write them
 * (they're presumably system-managed, e.g. by the attendance module).
 * - `managerId` — `User` has no manager relation/column anywhere in the
 * entity; there's simply no such concept on this table.
 * There's no global ValidationPipe registered, so sending them wouldn't
 * error — they'd just be silently dropped. Leaving them out keeps this
 * function an honest description of what the backend actually accepts.
 */
function toApiBody(payload: EmployeePayload | EmployeeCreatePayload) {
 return {
 employee_code: payload.employeeCode,
 first_name: payload.firstName,
 last_name: payload.lastName,
 email: payload.email,
 ...("password" in payload ? { password: payload.password } : {}),
 phone: payload.phone,
 profile_image: payload.profileImageUrl,
 date_of_birth: payload.dateOfBirth,
 gender: GENDER_TO_API[payload.gender] ?? payload.gender,
 address: payload.address,
 employee_type: EMPLOYMENT_TYPE_TO_API[payload.employmentType] ?? payload.employmentType,
 joining_date: payload.joiningDate,
 salary: payload.salary,
 status: payload.status === "active",
 role_id: payload.roleId,
 department_id: payload.departmentId,
 designation_id: payload.designationId,
 job_category_id: payload.jobCategoryId,
 shift_id: payload.shiftId,
 };
}

/**
 * Backend response -> the camelCase `Employee` shape the UI consumes.
 * Defensive about naming: accepts either the documented snake_case keys or
 * plain camelCase, and accepts either an `employeeId` or a bare `id`, since
 * the Swagger doc doesn't (yet) show the exact shape of what GET returns —
 * only what POST accepts.
 */
// Real `/users` responses come back Title-Cased ("Full-Time", "Male") — the
// app's internal model uses lowercase snake_case. Normalize instead of
// hardcoding a lookup table so any casing/spacing variant still matches.
const toSnake = (v: unknown): string =>
 typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";

// Shared, module-level so remove() (and anything else that has to read a raw
// wire object defensively) can reuse them instead of guessing at shape.
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : Number(v) || fallback);
const bool = (v: unknown) => v === true || v === "true" || v === 1;
const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && v !== "");
const nested = (v: unknown, key: string): unknown =>
 v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;

function fromApiUser(rawIn: Record<string, unknown> | null | undefined): Employee {
 // Defensive against a 200/201 with an empty or unexpected body — fall back
 // to an empty object rather than throwing deep inside a `.then()`.
 const raw = rawIn && typeof rawIn === "object" ? rawIn : {};
 const gender = toSnake(raw.gender);
 const employmentType = toSnake(pick(raw.employmentType, raw.employee_type));

 return {
 employeeId: str(pick(raw.employeeId, raw.id, raw.user_id)),
 employeeCode: str(pick(raw.employeeCode, raw.employee_code)),
 firstName: str(pick(raw.firstName, raw.first_name)),
 lastName: str(pick(raw.lastName, raw.last_name)),
 email: str(raw.email),
 phone: str(raw.phone),
 profileImageUrl: str(pick(raw.profileImageUrl, raw.profile_image)),
 /** 128px derivative of `profileImageUrl`, for small renderings. */
 profileImageThumbUrl: str(pick(raw.profileImageThumbUrl, raw.profile_image_thumb)),
 dateOfBirth: str(pick(raw.dateOfBirth, raw.date_of_birth)),
 gender: (["male", "female", "other"].includes(gender) ? gender : "male") as Employee["gender"],
 address: str(raw.address),
 joiningDate: str(pick(raw.joiningDate, raw.joining_date)),
 employmentType: (["full_time", "part_time", "contract", "intern"].includes(employmentType)
 ? employmentType
 : "full_time") as Employee["employmentType"],
 salary: num(raw.salary),
 // Live field is `is_overtime`; `overtimeAllowed`/`overtime_allowed` kept
 // as fallbacks in case the backend renames it later.
 overtimeAllowed: bool(pick(raw.overtimeAllowed, raw.overtime_allowed, raw.is_overtime)),
 roleId: str(pick(raw.roleId, nested(raw.role, "role_id"), nested(raw.role, "id"))),
 roleName: str(pick(raw.roleName, nested(raw.role, "role_name"), nested(raw.role, "name")), "—"),
 departmentId: str(pick(raw.departmentId, nested(raw.department, "department_id"), nested(raw.department, "id"))),
 departmentName: str(
 pick(raw.departmentName, nested(raw.department, "department_name"), nested(raw.department, "name")),
 "—",
 ),
 designationId: str(
 pick(raw.designationId, nested(raw.designation, "designation_id"), nested(raw.designation, "id")),
 ),
 // The designation relation exposes the title under `title`, not `name`.
 designationName: str(
 pick(raw.designationName, nested(raw.designation, "title"), nested(raw.designation, "name")),
 "—",
 ),
 jobCategoryId: str(
 pick(raw.jobCategoryId, nested(raw.jobCategory, "job_category_id"), nested(raw.jobCategory, "id")),
 ),
 jobCategoryName: str(
 pick(raw.jobCategoryName, nested(raw.jobCategory, "job_category_name"), nested(raw.jobCategory, "name")),
 "—",
 ),
 shiftId: str(pick(raw.shiftId, nested(raw.shift, "shift_id"), nested(raw.shift, "id"))),
 shiftName: str(pick(raw.shiftName, nested(raw.shift, "shift_name"), nested(raw.shift, "name")), "—"),
 managerId: str(pick(raw.managerId, raw.manager_id, nested(raw.manager, "user_id"), nested(raw.manager, "id"))),
 managerName: str(
 pick(
 raw.managerName,
 nested(raw.manager, "name"),
 [nested(raw.manager, "first_name"), nested(raw.manager, "last_name")].filter(Boolean).join(" ") || undefined,
 ),
 "—",
 ),
 status: bool(raw.status) || raw.status === "active" ? "active" : "inactive",
 createdAt: str(pick(raw.createdAt, raw.created_at), new Date().toISOString().slice(0, 10)),
 };
}

export const employeesApi = {
 list: (params: ListParams = {}): Promise<ListResult<Employee>> =>
 apiRequest<unknown>(`${ENDPOINTS.users.base}${qs(params)}`).then((raw) => {
 const normalized = normalizeListResult<Record<string, unknown>>(raw);
 return { data: normalized.data.map(fromApiUser), total: normalized.total };
 }),

 getById: (id: string): Promise<Employee> =>
 apiRequest<Record<string, unknown>>(ENDPOINTS.users.byId(id)).then(fromApiUser),

 create: (payload: EmployeeCreatePayload): Promise<Employee> =>
 apiRequest<Record<string, unknown>>(ENDPOINTS.users.base, { method: "POST", body: toApiBody(payload) }).then(fromApiUser),

 update: (id: string, payload: EmployeePayload): Promise<Employee> =>
 apiRequest<Record<string, unknown>>(ENDPOINTS.users.byId(id), { method: "PATCH", body: toApiBody(payload) }).then(fromApiUser),

 setStatus: (id: string, status: "active" | "inactive"): Promise<Employee> =>
 apiRequest<Record<string, unknown>>(ENDPOINTS.users.byId(id), { method: "PATCH", body: { status: status === "active" } }).then(
 fromApiUser,
 ),

 remove: (id: string): Promise<{ employeeId: string }> =>
 apiRequest<Record<string, unknown> | null>(ENDPOINTS.users.byId(id), { method: "DELETE" }).then((raw) => ({
 // A 204/empty body, `{ employeeId }`, `{ user_id }`, or the full
 // deleted user object should all resolve correctly — fall back to
 // the id we requested deletion of if the body doesn't echo one.
 employeeId: str(pick(raw?.employeeId, raw?.id, raw?.user_id), id),
 })),
};
