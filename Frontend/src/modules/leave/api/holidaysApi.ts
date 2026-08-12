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
import { mockNotificationApi } from "@/mocks/hrMockData";

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
  { holidayId: "demo-h1", name: "New Year's Day", eventType: "Holiday", holidayDate: "2026-01-01", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true, notify: false, notifiedAt: null },
  { holidayId: "demo-h2", name: "Labour Day", eventType: "Holiday", holidayDate: "2026-05-01", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true, notify: false, notifiedAt: null },
  { holidayId: "demo-h3", name: "Independence Day", eventType: "Holiday", holidayDate: "2026-08-14", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true, notify: false, notifiedAt: null },
  { holidayId: "demo-h4", name: "Christmas Day", eventType: "Holiday", holidayDate: "2026-12-25", description: "", departmentId: null, departmentName: "Company-wide", isRecurring: true, notify: false, notifiedAt: null },
  { holidayId: "demo-h5", name: "Eid-ul-Adha", eventType: "Holiday", holidayDate: "2026-08-16", description: "Public holiday for Eid-ul-Adha.", departmentId: null, departmentName: "Company-wide", isRecurring: false, notify: true, notifiedAt: "2026-07-01T09:00:00Z" },
  { holidayId: "demo-h6", name: "Dinner", eventType: "Event", holidayDate: "2026-08-17", description: "Company dinner — everyone's invited.", departmentId: null, departmentName: "Company-wide", isRecurring: false, notify: true, notifiedAt: "2026-07-25T09:00:00Z" },
];

// Mirror of HolidaysService.hasDuplicate: scope + event type matched exactly;
// a recurring holiday on either side collides on month/day across every
// year, two fixed entries collide only on the exact same date. A Holiday and
// an Event on the same day never collide with each other.
function demoCollides(payload: HolidayPayload, excludeId?: string): boolean {
  const scope = payload.departmentId ? payload.departmentId : null;
  const type = payload.eventType ?? "Holiday";
  const [y, m, d] = payload.holidayDate.split("-");
  const recurring = payload.isRecurring ?? false;
  return demoStore.some((h) => {
    if (excludeId && h.holidayId === excludeId) return false;
    if ((h.departmentId ?? null) !== scope) return false;
    if (h.eventType !== type) return false;
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

// Fires the demo bell the same way the backend's `HolidaysService.announce`
// does — best-effort, and never lets a notification hiccup fail the save
// that already succeeded.
function demoAnnounce(row: Holiday): void {
  const dateLabel = new Date(`${row.holidayDate}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const isEvent = row.eventType === "Event";
  mockNotificationApi
    .create({
      title: `${isEvent ? "New event" : "Upcoming holiday"}: ${row.name}`,
      message: `${row.name} is scheduled on ${dateLabel}.${row.description ? ` ${row.description}` : ""}`,
      type: "Announcement",
    })
    .catch(() => undefined);
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
    if (params.eventType) {
      rows = rows.filter((h) => h.eventType === params.eventType);
    }
    return applyClientFilters(rows, params);
  },
  create(payload: HolidayPayload): Holiday {
    if (demoCollides(payload)) throw new Error(DUPLICATE_MESSAGE);
    const notify = payload.notify ?? false;
    const row: Holiday = {
      holidayId: makeId(),
      name: payload.name,
      eventType: payload.eventType ?? "Holiday",
      holidayDate: payload.holidayDate,
      description: payload.description ?? "",
      departmentId: payload.departmentId ? payload.departmentId : null,
      departmentName: demoDepartmentName(payload.departmentId ? payload.departmentId : null),
      isRecurring: payload.isRecurring ?? false,
      notify,
      notifiedAt: notify ? new Date().toISOString() : null,
    };
    demoStore.push(row);
    if (notify) demoAnnounce(row);
    return row;
  },
  update(id: string, payload: HolidayPayload): Holiday {
    if (demoCollides(payload, id)) throw new Error(DUPLICATE_MESSAGE);
    const idx = demoStore.findIndex((h) => h.holidayId === id);
    if (idx === -1) throw new Error("Holiday not found");
    const departmentId = payload.departmentId ? payload.departmentId : null;
    const notify = payload.notify ?? false;
    const updated: Holiday = {
      ...demoStore[idx],
      name: payload.name,
      eventType: payload.eventType ?? "Holiday",
      holidayDate: payload.holidayDate,
      description: payload.description ?? "",
      departmentId,
      departmentName: demoDepartmentName(departmentId),
      isRecurring: payload.isRecurring ?? false,
      notify,
      // A fresh notify request re-announces, mirroring the backend: editing
      // and asking again is a deliberate re-send, not a no-op.
      notifiedAt: notify ? new Date().toISOString() : demoStore[idx].notifiedAt,
    };
    demoStore[idx] = updated;
    if (notify) demoAnnounce(updated);
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
