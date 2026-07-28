// API module for org-wide Employee Management (HR / Administrator).
//
// Same contract as authApi/hrApi/settingsApi: every call tries the real
// NestJS backend first (apiRequest — pings /health, attaches the JWT), and
// only falls back to the in-memory mock store (employeeMockData.ts) when the
// backend is completely unreachable. Real backend errors (validation,
// duplicate email, etc.) are never swallowed — only "can't reach the API at
// all" triggers the fallback.
//
// Live backend routes ("Users" controller in the Swagger doc — the ERD's
// `Employees (Users)` table is exposed there, not under `/employees`):
//   GET    /api/users            list
//   GET    /api/users/:id        view details
//   POST   /api/users            create
//   DELETE /api/users/:id        delete
// The Swagger doc's request/response body for this controller is snake_case
// and shaped like:
//   {
//     employee_code, first_name, last_name, email, password, phone,
//     profile_image, date_of_birth, gender, address, employee_type,
//     joining_date, salary, status, roleId, departmentId, designationId,
//     jobCategoryId, shiftId
//   }
// (note: the FK fields — roleId/departmentId/designationId/jobCategoryId/
// shiftId — stay camelCase even though the rest of the body is snake_case;
// that's exactly how the Swagger example is documented). `toApiBody` /
// `fromApiUser` below are the only place that translate between that wire
// shape and the camelCase `Employee` shape the rest of the app uses.
//
// There is no PATCH route documented for this controller yet. `update` and
// `setStatus` are kept schema-shaped (PATCH /api/users/:id) so they start
// working the moment the backend adds it; until then, apiRequest's 404
// handling makes them fall back to the in-memory mock store automatically.

import { apiRequest, withDemoFallback, normalizeListResult } from "./api";
import {
  mockEmployeesApi,
  type Employee,
  type EmployeePayload,
  type EmployeeCreatePayload,
  type ListParams,
  type ListResult,
} from "./employeeMockData";

export type {
  Employee,
  EmployeePayload,
  EmployeeCreatePayload,
  Gender,
  EmploymentType,
  EmployeeStatus,
  ListParams,
  ListResult,
} from "./employeeMockData";

const qs = (params: ListParams) => {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.departmentId) search.set("departmentId", params.departmentId);
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const str = search.toString();
  return str ? `?${str}` : "";
};

// ---- Wire <-> app-model mapping (per the /api/users Swagger schema) -------

/** camelCase EmployeePayload -> the snake_case body the Swagger schema documents. */
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
    gender: payload.gender,
    address: payload.address,
    employee_type: payload.employmentType,
    joining_date: payload.joiningDate,
    salary: payload.salary,
    overtime_allowed: payload.overtimeAllowed,
    status: payload.status === "active",
    roleId: payload.roleId,
    departmentId: payload.departmentId,
    designationId: payload.designationId,
    jobCategoryId: payload.jobCategoryId,
    shiftId: payload.shiftId,
    managerId: payload.managerId,
  };
}

/**
 * Backend response -> the camelCase `Employee` shape the UI consumes.
 * Defensive about naming: accepts either the documented snake_case keys or
 * plain camelCase, and accepts either an `employeeId` or a bare `id`, since
 * the Swagger doc doesn't (yet) show the exact shape of what GET returns —
 * only what POST accepts.
 */
function fromApiUser(raw: Record<string, unknown>): Employee {
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  const num = (v: unknown, fallback = 0) => (typeof v === "number" ? v : Number(v) || fallback);
  const bool = (v: unknown) => v === true || v === "true" || v === 1;
  const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null);
  const nested = (v: unknown, key: string): unknown =>
    v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;

  return {
    employeeId: str(pick(raw.employeeId, raw.id, raw.user_id)),
    employeeCode: str(pick(raw.employeeCode, raw.employee_code)),
    firstName: str(pick(raw.firstName, raw.first_name)),
    lastName: str(pick(raw.lastName, raw.last_name)),
    email: str(raw.email),
    phone: str(raw.phone),
    profileImageUrl: str(pick(raw.profileImageUrl, raw.profile_image)),
    dateOfBirth: str(pick(raw.dateOfBirth, raw.date_of_birth)),
    gender: str(raw.gender, "male") as Employee["gender"],
    address: str(raw.address),
    joiningDate: str(pick(raw.joiningDate, raw.joining_date)),
    employmentType: str(pick(raw.employmentType, raw.employee_type), "full_time") as Employee["employmentType"],
    salary: num(raw.salary),
    overtimeAllowed: bool(pick(raw.overtimeAllowed, raw.overtime_allowed)),
    roleId: str(raw.roleId),
    roleName: str(pick(raw.roleName, nested(raw.role, "role_name"), nested(raw.role, "name")), "—"),
    departmentId: str(raw.departmentId),
    departmentName: str(pick(raw.departmentName, nested(raw.department, "name")), "—"),
    designationId: str(raw.designationId),
    designationName: str(pick(raw.designationName, nested(raw.designation, "name")), "—"),
    jobCategoryId: str(raw.jobCategoryId),
    jobCategoryName: str(pick(raw.jobCategoryName, nested(raw.jobCategory, "name")), "—"),
    shiftId: str(raw.shiftId),
    shiftName: str(pick(raw.shiftName, nested(raw.shift, "name")), "—"),
    managerId: str(pick(raw.managerId, raw.manager_id)),
    managerName: str(pick(raw.managerName, nested(raw.manager, "name"), nested(raw.manager, "first_name")), "—"),
    status: bool(raw.status) || raw.status === "active" ? "active" : "inactive",
    createdAt: str(pick(raw.createdAt, raw.created_at), new Date().toISOString().slice(0, 10)),
  };
}

export const employeesApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Employee>>(
      () =>
        apiRequest<unknown>(`/users${qs(params)}`).then((raw) => {
          const normalized = normalizeListResult<Record<string, unknown>>(raw);
          return { data: normalized.data.map(fromApiUser), total: normalized.total };
        }),
      () => mockEmployeesApi.list(params),
    ),

  getById: (id: string) =>
    withDemoFallback<Employee>(
      () => apiRequest<Record<string, unknown>>(`/users/${id}`).then(fromApiUser),
      () => mockEmployeesApi.getById(id),
    ),

  create: (payload: EmployeeCreatePayload) =>
    withDemoFallback<Employee>(
      () => apiRequest<Record<string, unknown>>("/users", { method: "POST", body: toApiBody(payload) }).then(fromApiUser),
      () => mockEmployeesApi.create(payload),
    ),

  update: (id: string, payload: EmployeePayload) =>
    withDemoFallback<Employee>(
      () => apiRequest<Record<string, unknown>>(`/users/${id}`, { method: "PATCH", body: toApiBody(payload) }).then(fromApiUser),
      () => mockEmployeesApi.update(id, payload),
    ),

  setStatus: (id: string, status: "active" | "inactive") =>
    withDemoFallback<Employee>(
      () =>
        apiRequest<Record<string, unknown>>(`/users/${id}`, { method: "PATCH", body: { status: status === "active" } }).then(
          fromApiUser,
        ),
      () => mockEmployeesApi.setStatus(id, status),
    ),

  remove: (id: string) =>
    withDemoFallback<{ employeeId: string }>(
      () => apiRequest<{ employeeId: string }>(`/users/${id}`, { method: "DELETE" }),
      () => mockEmployeesApi.remove(id),
    ),
};
