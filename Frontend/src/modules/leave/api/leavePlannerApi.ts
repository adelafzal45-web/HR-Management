// Data source for the Leave Planner calendar.
//
// The planner doesn't own any backend route of its own — it composes two that
// already exist, and its only real job is normalizing them into one shape the
// calendar can paint:
//
//   • Leave  — `GET /leave-requests` for management (org-wide, gated on
//     `leave-request.view`, which HR Manager / Administrator / Team Lead hold)
//     or `GET /leave-requests/me` for an employee, who holds neither
//     `leave-request.view` nor `.create` and may only ever see their own.
//     Which one is used is decided by `scope`, NOT by a client-side filter, so
//     an employee's browser never receives other people's leave at all.
//
//   • Holidays — `GET /holidays?year=`, gated on `holiday.view`, which every
//     role including Employee holds (migration 1788300000000).
//
// The planner owns no route and no error handling of its own — it just
// composes those calls and normalizes them into one shape, so a backend
// failure in either source propagates straight to the page rather than being
// masked by fabricated data.

import { holidaysApi, type Holiday } from "@/modules/leave/api/holidaysApi";
import { adminLeaveApi } from "@/modules/settings/api/adminOpsApi";
import { leaveApi } from "@/api/hrApi";

/** Whose leave the planner is showing. */
export type PlannerScope = "mine" | "organization";

export type PlannerStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

/** One leave request, flattened to what the calendar actually paints. */
export type PlannerLeave = {
  leaveId: string;
  employeeId: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  leaveTypeName: string;
  /** ISO `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** ISO `YYYY-MM-DD`, inclusive. Equals `startDate` for single-day leave. */
  endDate: string;
  durationType: string;
  status: PlannerStatus;
};

/** A holiday resolved onto a specific calendar year (see `projectHolidays`). */
export type PlannerHoliday = {
  holidayId: string;
  name: string;
  /** ISO `YYYY-MM-DD` in the year being viewed, not the year it was created. */
  date: string;
  departmentId: string | null;
  departmentName: string;
  isRecurring: boolean;
};

export type PlannerData = {
  leaves: PlannerLeave[];
  holidays: PlannerHoliday[];
};

export type PlannerParams = {
  year: number;
  scope: PlannerScope;
  /** Only meaningful for the "organization" scope. */
  departmentId?: string;
  /** Label used for the signed-in user's own rows in the "mine" scope. */
  selfName?: string;
};

/**
 * Projects holidays onto the year being viewed.
 *
 * A recurring holiday is stored once, under whatever year it was entered, and
 * `GET /holidays?year=` returns it for *every* year (`... OR is_recurring =
 * true`) without rewriting the date. Painting `holiday_date` as-is would drop
 * every recurring holiday off a calendar for any year but the one it was
 * created in, so the month and day are re-based onto `year` here — matching
 * what the backend's own `getHolidayDateSet` does when it excludes holidays
 * from leave-day counts.
 *
 * Feb 29 on a non-leap year is dropped rather than silently sliding to Mar 1.
 */
function projectHolidays(rows: Holiday[], year: number): PlannerHoliday[] {
  const out: PlannerHoliday[] = [];
  for (const h of rows) {
    const [rawYear, month, day] = h.holidayDate.split("-");
    if (!rawYear || !month || !day) continue;

    let date = h.holidayDate;
    if (h.isRecurring && rawYear !== String(year)) {
      if (month === "02" && day === "29" && !isLeapYear(year)) continue;
      date = `${year}-${month}-${day}`;
    } else if (rawYear !== String(year)) {
      // A one-off holiday from another year — the backend's year filter should
      // already have excluded it, but don't paint it if it slips through.
      continue;
    }

    out.push({
      holidayId: h.holidayId,
      name: h.name,
      date,
      departmentId: h.departmentId,
      departmentName: h.departmentName,
      isRecurring: h.isRecurring,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// `status` is a plain varchar(20) on the backend, and "Cancelled" is a real
// value the service sets (see CANCELLED in leave-requests.service) even though
// the frontend's LeaveStatus/AdminLeaveStatus unions predate it. Listing it
// explicitly keeps a withdrawn request from being painted as still-pending.
const KNOWN_STATUSES = new Set<PlannerStatus>(["Pending", "Approved", "Rejected", "Cancelled"]);

function normalizeStatus(status: string): PlannerStatus {
  return KNOWN_STATUSES.has(status as PlannerStatus) ? (status as PlannerStatus) : "Pending";
}

export const leavePlannerApi = {
  async load(params: PlannerParams): Promise<PlannerData> {
    const [holidayResult, leaves] = await Promise.all([
      // pageSize 0 opts out of the client-side paging holidaysApi applies by
      // default (10 rows) — the calendar needs the whole year at once.
      holidaysApi.list({
        year: params.year,
        eventType: "Holiday",
        pageSize: 0,
        departmentId: params.departmentId || undefined,
      }),
      params.scope === "mine"
        ? loadOwnLeave(params.selfName)
        : loadOrganizationLeave(params.departmentId),
    ]);

    return { leaves, holidays: projectHolidays(holidayResult.data, params.year) };
  },
};

async function loadOwnLeave(selfName?: string): Promise<PlannerLeave[]> {
  const rows = await leaveApi.getMyLeaves();
  return rows.map((r) => ({
    leaveId: r.leaveId,
    employeeId: r.employeeId,
    employeeName: selfName?.trim() || "You",
    // /leave-requests/me returns no department (the row nests only `user`),
    // and the employee has no route that would tell them theirs.
    departmentId: "",
    departmentName: "—",
    leaveTypeName: r.leaveTypeName,
    startDate: r.startDate,
    endDate: r.endDate,
    durationType: r.durationType,
    status: normalizeStatus(r.status),
  }));
}

async function loadOrganizationLeave(departmentId?: string): Promise<PlannerLeave[]> {
  // `pageSize: 0` is the codebase's "all rows" convention: adminLeaveApi's
  // client-side paginator treats a 0 (or absent) pageSize as "return every
  // matching row", which the calendar needs — a whole year of requests, not a
  // single 10-row page. The department filter is passed through rather than
  // applied client-side so a large org isn't adapted and then thrown away.
  const { data } = await adminLeaveApi.list({
    departmentId: departmentId || undefined,
    pageSize: 0,
  });
  return data.map((r) => ({
    leaveId: r.leaveId,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    leaveTypeName: r.leaveTypeName,
    startDate: r.startDate,
    endDate: r.endDate,
    durationType: r.durationType,
    status: normalizeStatus(r.status),
  }));
}
