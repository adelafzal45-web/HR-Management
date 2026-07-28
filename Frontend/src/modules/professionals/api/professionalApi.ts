// API module for org-wide Professional Management (HR / Administrator).
//
// Same contract as authApi/hrApi/settingsApi: every call tries the real
// NestJS backend first (apiRequest — pings the API root, attaches the JWT),
// and only falls back to the in-memory mock store (professionalMockData.ts) when
// the backend is completely unreachable. Real backend errors (validation,
// duplicate email, etc.) are never swallowed — only "can't reach the API at
// all" triggers the fallback.
//
// Verified directly against the backend source
// (Backend/src/users/{users.controller,users.service,user.entity}.ts and
// dto/{create-user,update-user}.dto.ts) — not guessed from Swagger:
//
//   POST   /api/users        body: CreateUserDto        -> the created user
//   GET    /api/users        (no query params supported — findAll() takes
//                             none; ignored ones are dropped server-side)
//   GET    /api/users/:id                                -> one user
//   PATCH  /api/users/:id     body: Partial<CreateUserDto> -> the updated user
//   DELETE /api/users/:id                                -> { message }
//
// CreateUserDto (UpdateUserDto = PartialType(CreateUserDto), so same shape,
// all optional) fields: professional_code, first_name, last_name, email,
// password, phone?, profile_image?, date_of_birth?, gender?, address?,
// professional_type, joining_date, salary?, status?, roleId, departmentId,
// designationId, jobCategoryId, shiftId. (FK fields stay camelCase even
// though the rest of the body is snake_case — that's exactly how the DTO is
// written.) `toApiBody` / `fromApiUser` below are the only place that
// translate between that wire shape and the camelCase `Professional` shape the
// rest of the app uses.
//
// GET responses include the FK relations populated as nested objects
// (`relations: ['role','department','designation','shift','jobCategory']`
// in users.service.ts), e.g. `department: { department_id, department_name,
// description }`, `designation: { designation_id, title }` — the designation
// relation's display field is `title`, not `name`. `fromApiUser` reads those
// nested shapes directly.
//
// Not supported by this endpoint at all, so the frontend can't write them
// here: `overtimeAllowed` (the entity has `is_overtime`/`working_hours`/
// `overtime_hours`/`attendance_status` columns, but none are in
// CreateUserDto/UpdateUserDto — presumably system-managed elsewhere, e.g.
// attendance) and `managerId` (User has no manager relation/column at all).

import { apiRequest, withDemoFallback, normalizeListResult } from "@/api/client";
import {
  mockProfessionalsApi,
  type Professional,
  type ProfessionalPayload,
  type ProfessionalCreatePayload,
  type ListParams,
  type ListResult,
} from "@/modules/professionals/mocks/professionalMockData";

export type {
  Professional,
  ProfessionalPayload,
  ProfessionalCreatePayload,
  Gender,
  EmploymentType,
  ProfessionalStatus,
  ListParams,
  ListResult,
} from "@/modules/professionals/mocks/professionalMockData";

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

// The live API's enums come back Title-Cased with hyphens (e.g. "Full-Time",
// "Male" — see the sample `/users` response), while the app's internal
// `Professional` model uses lowercase snake_case ("full_time", "male") so the UI
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
 * camelCase ProfessionalPayload -> the exact body `CreateUserDto`/`UpdateUserDto`
 * accept (verified against the real backend source — Backend/src/users/dto/
 * create-user.dto.ts, update-user.dto.ts extends PartialType(CreateUserDto)).
 *
 * Two fields are intentionally NOT sent, because the backend has nowhere to
 * put them:
 *  - `overtimeAllowed` — the entity's `is_overtime`/`working_hours`/
 *    `overtime_hours`/`attendance_status` columns exist, but none of them
 *    are in CreateUserDto/UpdateUserDto, so this endpoint can't write them
 *    (they're presumably system-managed, e.g. by the attendance module).
 *  - `managerId` — `User` has no manager relation/column anywhere in the
 *    entity; there's simply no such concept on this table.
 * There's no global ValidationPipe registered, so sending them wouldn't
 * error — they'd just be silently dropped. Leaving them out keeps this
 * function an honest description of what the backend actually accepts.
 */
function toApiBody(payload: ProfessionalPayload | ProfessionalCreatePayload) {
  return {
    professional_code: payload.professionalCode,
    first_name: payload.firstName,
    last_name: payload.lastName,
    email: payload.email,
    ...("password" in payload ? { password: payload.password } : {}),
    phone: payload.phone,
    profile_image: payload.profileImageUrl,
    date_of_birth: payload.dateOfBirth,
    gender: GENDER_TO_API[payload.gender] ?? payload.gender,
    address: payload.address,
    professional_type: EMPLOYMENT_TYPE_TO_API[payload.employmentType] ?? payload.employmentType,
    joining_date: payload.joiningDate,
    salary: payload.salary,
    status: payload.status === "active",
    roleId: payload.roleId,
    departmentId: payload.departmentId,
    designationId: payload.designationId,
    jobCategoryId: payload.jobCategoryId,
    shiftId: payload.shiftId,
  };
}

/**
 * Backend response -> the camelCase `Professional` shape the UI consumes.
 * Defensive about naming: accepts either the documented snake_case keys or
 * plain camelCase, and accepts either an `professionalId` or a bare `id`, since
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

function fromApiUser(rawIn: Record<string, unknown> | null | undefined): Professional {
  // Defensive against a 200/201 with an empty or unexpected body — fall back
  // to an empty object rather than throwing deep inside a `.then()`.
  const raw = rawIn && typeof rawIn === "object" ? rawIn : {};
  const gender = toSnake(raw.gender);
  const employmentType = toSnake(pick(raw.employmentType, raw.professional_type));

  return {
    professionalId: str(pick(raw.professionalId, raw.id, raw.user_id)),
    professionalCode: str(pick(raw.professionalCode, raw.professional_code)),
    firstName: str(pick(raw.firstName, raw.first_name)),
    lastName: str(pick(raw.lastName, raw.last_name)),
    email: str(raw.email),
    phone: str(raw.phone),
    profileImageUrl: str(pick(raw.profileImageUrl, raw.profile_image)),
    dateOfBirth: str(pick(raw.dateOfBirth, raw.date_of_birth)),
    gender: (["male", "female", "other"].includes(gender) ? gender : "male") as Professional["gender"],
    address: str(raw.address),
    joiningDate: str(pick(raw.joiningDate, raw.joining_date)),
    employmentType: (["full_time", "part_time", "contract", "intern"].includes(employmentType)
      ? employmentType
      : "full_time") as Professional["employmentType"],
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

export const professionalsApi = {
  list: (params: ListParams = {}) =>
    withDemoFallback<ListResult<Professional>>(
      () =>
        apiRequest<unknown>(`/users${qs(params)}`).then((raw) => {
          const normalized = normalizeListResult<Record<string, unknown>>(raw);
          return { data: normalized.data.map(fromApiUser), total: normalized.total };
        }),
      () => mockProfessionalsApi.list(params),
    ),

  getById: (id: string) =>
    withDemoFallback<Professional>(
      () => apiRequest<Record<string, unknown>>(`/users/${id}`).then(fromApiUser),
      () => mockProfessionalsApi.getById(id),
    ),

  create: (payload: ProfessionalCreatePayload) =>
    withDemoFallback<Professional>(
      () => apiRequest<Record<string, unknown>>("/users", { method: "POST", body: toApiBody(payload) }).then(fromApiUser),
      () => mockProfessionalsApi.create(payload),
    ),

  update: (id: string, payload: ProfessionalPayload) =>
    withDemoFallback<Professional>(
      () => apiRequest<Record<string, unknown>>(`/users/${id}`, { method: "PATCH", body: toApiBody(payload) }).then(fromApiUser),
      () => mockProfessionalsApi.update(id, payload),
    ),

  setStatus: (id: string, status: "active" | "inactive") =>
    withDemoFallback<Professional>(
      () =>
        apiRequest<Record<string, unknown>>(`/users/${id}`, { method: "PATCH", body: { status: status === "active" } }).then(
          fromApiUser,
        ),
      () => mockProfessionalsApi.setStatus(id, status),
    ),

  remove: (id: string) =>
    withDemoFallback<{ professionalId: string }>(
      () =>
        apiRequest<Record<string, unknown> | null>(`/users/${id}`, { method: "DELETE" }).then((raw) => ({
          // A 204/empty body, `{ professionalId }`, `{ user_id }`, or the full
          // deleted user object should all resolve correctly — fall back to
          // the id we requested deletion of if the body doesn't echo one.
          professionalId: str(pick(raw?.professionalId, raw?.id, raw?.user_id), id),
        })),
      () => mockProfessionalsApi.remove(id),
    ),
};
