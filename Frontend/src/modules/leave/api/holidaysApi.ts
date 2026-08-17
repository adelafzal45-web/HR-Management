// API module for the Public Holidays calendar (Admin/HR "Leave" workspace).
//
// Backed by the live CRUD controller at /holidays:
//   POST   /holidays            create (holiday.manage)
//   GET    /holidays?year&department_id   list — plain array, department joined (holiday.view)
//   PATCH  /holidays/:id         update (holiday.manage)
//   DELETE /holidays/:id         delete (holiday.manage)
//
// Talks to the real backend through the shared transport in lib/apiClient
// (JWT bearer, refresh cookie, 401 replay, timeout). There is NO demo/mock
// fallback: real backend errors — most importantly the 409 ConflictException
// the service throws on a duplicate holiday — surface to the page as an
// `ApiError` carrying the server message, never swallowed into fabricated data.
//
// The backend returns a bare array (with the `department` relation joined) and
// applies only the year/department filters server-side, so search and
// pagination are done client-side here to match the DataTable's paged contract.

import { apiRequest, ENDPOINTS } from "@/lib/apiClient";

/** `Holiday` is excluded from leave/attendance day counts; `Event` (a team
 * dinner, a town hall) is calendar-and-notification only. */
export type HolidayEventType = "Holiday" | "Event";

export type Holiday = {
  holidayId: string;
  name: string;
  eventType: HolidayEventType;
  /** ISO calendar date, `YYYY-MM-DD` (no time component). */
  holidayDate: string;
  description: string;
  /** null = company-wide; otherwise scoped to this department. */
  departmentId: string | null;
  departmentName: string;
  isRecurring: boolean;
  /** Whether an announcement was requested when this was created/edited. */
  notify: boolean;
  /** Set once the announcement actually went out; null if never sent. */
  notifiedAt: string | null;
};

export type HolidayPayload = {
  name: string;
  eventType?: HolidayEventType;
  holidayDate: string;
  description?: string;
  /** null / omitted = company-wide. */
  departmentId?: string | null;
  isRecurring?: boolean;
  /** Send an in-app notification to every active employee about this entry. */
  notify?: boolean;
};

export type HolidayListParams = {
  search?: string;
  year?: number;
  departmentId?: string;
  eventType?: HolidayEventType;
  page?: number;
  pageSize?: number;
};

export type HolidayListResult = { data: Holiday[]; total: number };

// Raw snake_case shape the backend serializes, with the department relation
// joined (nested) by the query builder.
type ApiHoliday = {
  holiday_id: string;
  name: string;
  event_type?: HolidayEventType;
  holiday_date: string;
  description?: string | null;
  department?: { department_id: string; department_name: string } | null;
  department_id?: string | null;
  is_recurring: boolean;
  notify?: boolean;
  notified_at?: string | null;
};

function adaptRow(raw: ApiHoliday): Holiday {
  const departmentId = raw.department?.department_id ?? raw.department_id ?? null;
  const departmentName = departmentId
    ? raw.department?.department_name ?? "—"
    : "Company-wide";
  return {
    holidayId: raw.holiday_id,
    name: raw.name,
    eventType: raw.event_type ?? "Holiday",
    holidayDate: String(raw.holiday_date).slice(0, 10),
    description: raw.description ?? "",
    departmentId,
    departmentName,
    isRecurring: Boolean(raw.is_recurring),
    notify: Boolean(raw.notify),
    notifiedAt: raw.notified_at ? String(raw.notified_at) : null,
  };
}

function toApiPayload(payload: HolidayPayload): Record<string, unknown> {
  return {
    name: payload.name,
    event_type: payload.eventType ?? "Holiday",
    holiday_date: payload.holidayDate,
    description: payload.description,
    // null (not "") tells the backend "company-wide". The DTO's @IsOptional()
    // skips UUID validation on null, and both create and update read
    // `department_id` explicitly, so sending null is how a holiday is set (or
    // reset) to company-wide scope.
    department_id: payload.departmentId ? payload.departmentId : null,
    is_recurring: payload.isRecurring ?? false,
    notify: payload.notify ?? false,
  };
}

function qs(params: HolidayListParams): string {
  const sp = new URLSearchParams();
  if (params.year) sp.set("year", String(params.year));
  if (params.departmentId) sp.set("department_id", params.departmentId);
  if (params.eventType) sp.set("event_type", params.eventType);
  const str = sp.toString();
  return str ? `?${str}` : "";
}

// Search + sort + paginate the fully-adapted set client-side: the backend
// returns an unpaged array (only year/department filtered), so the DataTable's
// page/search/sort contract is satisfied here.
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

export const holidaysApi = {
  list: async (params: HolidayListParams = {}): Promise<HolidayListResult> => {
    const raw = await apiRequest<ApiHoliday[]>(`${ENDPOINTS.holidays.base}${qs(params)}`);
    const rows = (Array.isArray(raw) ? raw : []).map(adaptRow);
    return applyClientFilters(rows, params);
  },

  create: async (payload: HolidayPayload): Promise<Holiday> => {
    const raw = await apiRequest<ApiHoliday>(ENDPOINTS.holidays.base, {
      method: "POST",
      body: toApiPayload(payload),
    });
    return adaptRow(raw);
  },

  update: async (id: string, payload: HolidayPayload): Promise<Holiday> => {
    const raw = await apiRequest<ApiHoliday>(ENDPOINTS.holidays.byId(id), {
      method: "PATCH",
      body: toApiPayload(payload),
    });
    return adaptRow(raw);
  },

  remove: async (id: string): Promise<void> => {
    await apiRequest<{ message: string }>(ENDPOINTS.holidays.byId(id), { method: "DELETE" });
  },
};
