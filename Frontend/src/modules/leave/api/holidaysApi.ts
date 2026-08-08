// API module for the Public Holidays calendar (Admin/HR "Leave" workspace).
//
// Backed by the live CRUD controller at /holidays:
//   POST   /holidays            create (holiday.manage)
//   GET    /holidays?year&department_id   list — plain array, department joined (holiday.view)
//   PATCH  /holidays/:id         update (holiday.manage)
//   DELETE /holidays/:id         delete (holiday.manage)
//
// Same contract as leaveEntitlementsApi.ts / settingsApi.ts: try the real
// backend first (apiRequest — pings the API root, attaches the JWT), and only
// fall back to a client-synthesized demo dataset when the backend is
// completely unreachable (BackendUnavailableError). Real backend errors — most
// importantly the 409 ConflictException the service throws on a duplicate
// holiday — are NEVER swallowed; they surface to the page as a plain Error with
// the server message.
//
// The backend returns a bare array (with the `department` relation joined) and
// applies only the year/department filters server-side, so search and
// pagination are done client-side here to match the DataTable's paged contract.

import { apiRequest, withDemoFallback } from "@/api/client";
import { ENDPOINTS } from "@/app/config/endpoints";

export type Holiday = {
  holidayId: string;
  name: string;
  /** ISO calendar date, `YYYY-MM-DD` (no time component). */
  holidayDate: string;
  description: string;
  /** null = company-wide; otherwise scoped to this department. */
  departmentId: string | null;
  departmentName: string;
  isRecurring: boolean;
};

export type HolidayPayload = {
  name: string;
  holidayDate: string;
  description?: string;
  /** null / omitted = company-wide. */
  departmentId?: string | null;
  isRecurring?: boolean;
};

export type HolidayListParams = {
  search?: string;
  year?: number;
  departmentId?: string;
  page?: number;
  pageSize?: number;
};

export type HolidayListResult = { data: Holiday[]; total: number };

// Raw snake_case shape the backend serializes, with the department relation
// joined (nested) by the query builder.
type ApiHoliday = {
  holiday_id: string;
  name: string;
  holiday_date: string;
  description?: string | null;
  department?: { department_id: string; department_name: string } | null;
  department_id?: string | null;
  is_recurring: boolean;
};

function adaptRow(raw: ApiHoliday): Holiday {
  const departmentId = raw.department?.department_id ?? raw.department_id ?? null;
  const departmentName = departmentId
    ? raw.department?.department_name ?? "—"
    : "Company-wide";
  return {
    holidayId: raw.holiday_id,
    name: raw.name,
    holidayDate: String(raw.holiday_date).slice(0, 10),
    description: raw.description ?? "",
    departmentId,
    departmentName,
    isRecurring: Boolean(raw.is_recurring),
  };
}

function toApiPayload(payload: HolidayPayload): Record<string, unknown> {
  return {
    name: payload.name,
    holiday_date: payload.holidayDate,
    description: payload.description,
    // null (not "") tells the backend "company-wide". The DTO's @IsOptional()
    // skips UUID validation on null, and both create and update read
    // `department_id` explicitly, so sending null is how a holiday is set (or
    // reset) to company-wide scope.
    department_id: payload.departmentId ? payload.departmentId : null,
    is_recurring: payload.isRecurring ?? false,
  };
}

function qs(params: HolidayListParams): string {
  const sp = new URLSearchParams();
  if (params.year) sp.set("year", String(params.year));
  if (params.departmentId) sp.set("department_id", params.departmentId);
  const str = sp.toString();
  return str ? `?${str}` : "";
}

// Search + sort + paginate a fully-adapted set client-side — shared by the
// real path (backend returns an unpaged array) and the demo path.
function applyClientFilters(rows: Holiday[], params: HolidayListParams): HolidayListResult {
  const needle = params.search?.trim().toLowerCase();
  let filtered = needle
    ? rows.filter((r) =>
        [r.name, r.description, r.departmentName].join(" ").toLowerCase().includes(needle),
      )
    : rows;

  filtered = [...filtered].sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));

  const total = filtered.length;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const start = pageSize > 0 ? (page - 1) * pageSize : 0;
  const data = pageSize > 0 ? filtered.slice(start, start + pageSize) : filtered;
  return { data, total };
}

// ---- Demo fallback -------------------------------------------------------
// In-memory store used only when the backend is unreachable. It replicates the
// backend's duplicate-prevention rule so the demo behaves like the real thing.

const DUPLICATE_MESSAGE = "A holiday already exists for this date and department scope";

function makeId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `demo-${Date.now()}-${demoStore.length}`;
}

const demoStore: Holiday[] = [
  { holidayId: "demo-h1", name: "New Year's Day", holidayDate: "2026-01-01", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true },
  { holidayId: "demo-h2", name: "Labour Day", holidayDate: "2026-05-01", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true },
  { holidayId: "demo-h3", name: "Independence Day", holidayDate: "2026-08-14", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true },
  { holidayId: "demo-h4", name: "Christmas Day", holidayDate: "2026-12-25", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true },
];

// Mirror of HolidaysService.hasDuplicate: scope matched exactly; a recurring
// holiday on either side collides on month+day across every year, two fixed
// holidays collide only on the exact same date.
function demoCollides(payload: HolidayPayload, excludeId?: string): boolean {
  const scope = payload.departmentId ? payload.departmentId : null;
  const [y, m, d] = payload.holidayDate.split("-");
  const recurring = payload.isRecurring ?? false;
  return demoStore.some((h) => {
    if (excludeId && h.holidayId === excludeId) return false;
    if ((h.departmentId ?? null) !== scope) return false;
    const [ey, em, ed] = h.holidayDate.split("-");
    const sameMonthDay = em === m && ed === d;
    return recurring || h.isRecurring ? sameMonthDay : sameMonthDay && ey === y;
  });
}

function demoDepartmentName(departmentId: string | null): string {
  if (!departmentId) return "Company-wide";
  const existing = demoStore.find((h) => h.departmentId === departmentId);
  return existing ? existing.departmentName : "Department";
}

const mockHolidaysApi = {
  list(params: HolidayListParams): HolidayListResult {
    let rows = demoStore;
    if (params.year) {
      rows = rows.filter((h) => h.isRecurring || h.holidayDate.slice(0, 4) === String(params.year));
    }
    if (params.departmentId) {
      rows = rows.filter((h) => h.departmentId === null || h.departmentId === params.departmentId);
    }
    return applyClientFilters(rows, params);
  },
  create(payload: HolidayPayload): Holiday {
    if (demoCollides(payload)) throw new Error(DUPLICATE_MESSAGE);
    const row: Holiday = {
      holidayId: makeId(),
      name: payload.name,
      holidayDate: payload.holidayDate,
      description: payload.description ?? "",
      departmentId: payload.departmentId ? payload.departmentId : null,
      departmentName: demoDepartmentName(payload.departmentId ? payload.departmentId : null),
      isRecurring: payload.isRecurring ?? false,
    };
    demoStore.push(row);
    return row;
  },
  update(id: string, payload: HolidayPayload): Holiday {
    if (demoCollides(payload, id)) throw new Error(DUPLICATE_MESSAGE);
    const idx = demoStore.findIndex((h) => h.holidayId === id);
    if (idx === -1) throw new Error("Holiday not found");
    const departmentId = payload.departmentId ? payload.departmentId : null;
    const updated: Holiday = {
      ...demoStore[idx],
      name: payload.name,
      holidayDate: payload.holidayDate,
      description: payload.description ?? "",
      departmentId,
      departmentName: demoDepartmentName(departmentId),
      isRecurring: payload.isRecurring ?? false,
    };
    demoStore[idx] = updated;
    return updated;
  },
  remove(id: string): void {
    const idx = demoStore.findIndex((h) => h.holidayId === id);
    if (idx !== -1) demoStore.splice(idx, 1);
  },
};

export const holidaysApi = {
  list: (params: HolidayListParams = {}) =>
    withDemoFallback<HolidayListResult>(
      async () => {
        const raw = await apiRequest<ApiHoliday[]>(`${ENDPOINTS.holidays.base}${qs(params)}`);
        const rows = (Array.isArray(raw) ? raw : []).map(adaptRow);
        return applyClientFilters(rows, params);
      },
      async () => mockHolidaysApi.list(params),
    ),

  create: (payload: HolidayPayload) =>
    withDemoFallback<Holiday>(
      async () => {
        const raw = await apiRequest<ApiHoliday>(ENDPOINTS.holidays.base, {
          method: "POST",
          body: toApiPayload(payload),
        });
        return adaptRow(raw);
      },
      async () => mockHolidaysApi.create(payload),
    ),

  update: (id: string, payload: HolidayPayload) =>
    withDemoFallback<Holiday>(
      async () => {
        const raw = await apiRequest<ApiHoliday>(ENDPOINTS.holidays.byId(id), {
          method: "PATCH",
          body: toApiPayload(payload),
        });
        return adaptRow(raw);
      },
      async () => mockHolidaysApi.update(id, payload),
    ),

  remove: (id: string) =>
    withDemoFallback<void>(
      async () => {
        await apiRequest<{ message: string }>(ENDPOINTS.holidays.byId(id), { method: "DELETE" });
      },
      async () => mockHolidaysApi.remove(id),
    ),
};
