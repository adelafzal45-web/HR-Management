// API modules for the Phase 1 employee self-service screens:
// Attendance, Leave, Payroll, Appraisal, Notifications.
//
// Same contract as authApi/profileApi in api.ts: every call tries the real
// NestJS backend first (apiRequest, which itself pings /health and attaches
// the JWT), and only falls back to hardcoded demo data when the backend is
// completely unreachable. Real backend errors (validation, insufficient
// leave balance, etc.) are never swallowed — only "can't reach the API at
// all" triggers the fallback.
//
// Endpoint paths below are matched against the live Swagger doc where a
// route actually exists there today. Two tables (`Attendance`,
// `LeaveRequests`) are exposed as plain REST CRUD (`/attendance`,
// `/leave-requests` — POST/GET/GET :id/PATCH/DELETE, no convenience routes
// like /check-in or /apply), so this module builds the old
// "check in / today / my leaves" API surface on top of that generic CRUD
// client-side. Payroll and Appraisal have DB tables in the ERD but no REST
// controller in the Swagger doc yet — those paths are kept schema-shaped
// (plural of the table name, same convention as every confirmed route) so
// they start working the moment the backend adds them; until then the 404
// handler in api.ts routes them to demo data. Notifications *is* a confirmed
// live route (full CRUD at /notifications) — see the dedicated comment
// above that block for its specific shape.

import { apiRequest, withDemoFallback } from "@/api/client";
import { parseAttendanceRow, computeHours } from "@/modules/attendance/api/attendanceAdapter";
import { parseLeaveRow } from "@/modules/leave/api/leaveAdapter";
import { parsePayrollRow, type ParsedPayrollRow } from "@/modules/payroll/api/payrollAdapter";
import { ENDPOINTS } from "@/app/config/endpoints";
import { getSession } from "@/utils/auth";
import {
  mockAttendanceApi,
  mockLeaveApi,
  mockPayrollApi,
  mockAppraisalApi,
  mockNotificationApi,
  leaveTypes,
  type AttendanceRecord,
  type AttendanceStatus,
  type LeaveType,
  type LeaveRequest,
  type LeaveStatus,
  type PayrollRecord,
  type AppraisalRecord,
  type NotificationRecord,
  type NotificationType,
} from "@/mocks/hrMockData";

function currentEmployeeId(): string | undefined {
  return getSession()?.user.employeeId;
}

// Backend responses may come back either as a bare array or as the
// `{ data, total }` list envelope used elsewhere in this app (see
// settingsApi.ts / employeeApi.ts) — normalize both to an array.
function toArray<T>(res: T[] | { data: T[] }): T[] {
  return Array.isArray(res) ? res : (res?.data ?? []);
}

// Adapts one row from `GET /attendance` to the frontend's AttendanceRecord
// shape. The live rows nest the employee under `user` (e.g. `user.user_id`)
// and the shift under `shift` (e.g. `shift.shift_name`) rather than exposing
// flat `employee_id`/`shift_id` columns — see attendanceAdapter.ts for the
// confirmed shape. `working_hours`/`overtime_hours` also arrive as numeric
// strings (e.g. `"7.76"`), not numbers.
function adaptAttendanceRow(row: any): AttendanceRecord {
  const parsed = parseAttendanceRow(row);
  return {
    attendanceId: parsed.attendanceId,
    employeeId: parsed.employeeId,
    shiftId: parsed.shiftId,
    shiftName: parsed.shiftName,
    attendanceDate: parsed.attendanceDate,
    checkIn: parsed.checkIn,
    checkOut: parsed.checkOut,
    workingHours: parsed.workingHours,
    overtimeHours: parsed.overtimeHours,
    isOvertime: parsed.isOvertime,
    status: parsed.status as AttendanceStatus,
  };
}

// The live `GET /attendance` route takes no query params (findAll() ignores
// them — same as `/users`), so every filter below (by employee, by date, by
// month) has to happen client-side after fetching the full list.
async function fetchAllAttendance(): Promise<AttendanceRecord[]> {
  return toArray(await apiRequest<any>(ENDPOINTS.attendance.base)).map(adaptAttendanceRow);
}

// ---- Attendance — full CRUD at /attendance ---------------------------------
export const attendanceApi = {
  getToday: () =>
    withDemoFallback<AttendanceRecord | null>(
      async () => {
        const employeeId = currentEmployeeId();
        const today = new Date().toISOString().slice(0, 10);
        const rows = await fetchAllAttendance();
        return rows.find((r) => r.employeeId === employeeId && r.attendanceDate === today) ?? null;
      },
      () => mockAttendanceApi.getToday(),
    ),

  checkIn: () =>
    withDemoFallback<AttendanceRecord>(
      async () => {
        const employeeId = currentEmployeeId();
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");

        // No shift is stored on the session — reuse the employee's most
        // recent attendance row's shift, if one exists, so the FK isn't
        // dropped on every check-in.
        const priorRows = await fetchAllAttendance();
        const mine = priorRows.filter((r) => r.employeeId === employeeId).sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));
        const shiftId = mine[0]?.shiftId || undefined;

        const created = await apiRequest<any>(ENDPOINTS.attendance.base, {
          method: "POST",
          body: {
            user_id: employeeId,
            attendance_date: now.toISOString().slice(0, 10),
            check_in: `${hh}:${mm}:00`,
            attendance_status: now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15) ? "Late" : "Present",
            ...(shiftId ? { shiftId } : {}),
          },
        });
        return adaptAttendanceRow(created);
      },
      () => mockAttendanceApi.checkIn(),
    ),

  checkOut: () =>
    withDemoFallback<AttendanceRecord>(
      async () => {
        const today = await attendanceApi.getToday();
        if (!today) throw new Error("No check-in found for today.");
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const checkOut = `${hh}:${mm}`;
        // The live backend doesn't compute working/overtime hours itself
        // (its seed data shows `working_hours` unrelated to check-in/out),
        // so derive them here and send them along with the check-out time.
        const { workingHours, overtimeHours, isOvertime } = today.checkIn
          ? computeHours(today.checkIn, checkOut)
          : { workingHours: null, overtimeHours: null, isOvertime: false };
        const updated = await apiRequest<any>(ENDPOINTS.attendance.byId(today.attendanceId), {
          method: "PATCH",
          body: {
            check_out: `${checkOut}:00`,
            working_hours: workingHours,
            overtime_hours: overtimeHours,
            is_overtime: isOvertime,
          },
        });
        return adaptAttendanceRow(updated);
      },
      () => mockAttendanceApi.checkOut(),
    ),

  // The live API has no `?month=&year=` filter, so pull every record and
  // narrow to this employee + the requested month client-side.
  getHistory: (params: { month: number; year: number }) =>
    withDemoFallback<AttendanceRecord[]>(
      async () => {
        const employeeId = currentEmployeeId();
        const rows = await fetchAllAttendance();
        return rows
          .filter((r) => r.employeeId === employeeId)
          .filter((r) => {
            const d = new Date(r.attendanceDate);
            return d.getMonth() + 1 === params.month && d.getFullYear() === params.year;
          })
          .sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));
      },
      () => mockAttendanceApi.getHistory(params),
    ),
};

// Adapts one row from `GET /leave-requests` (confirmed shape: leave_id,
// leave_type, start_date, end_date, reason, status, applied_date,
// approved_date, user: {...}, approved_by: {...} | null — see
// leaveAdapter.ts) to the frontend's LeaveRequest shape. There's no
// LeaveType table (leave_type is a free-text column), so leaveTypeId is
// derived from the name rather than coming from the backend.
function adaptLeaveRow(row: any): LeaveRequest {
  const parsed = parseLeaveRow(row);
  return {
    leaveId: parsed.leaveId,
    employeeId: parsed.employeeId,
    leaveTypeId: leaveTypes.find((t) => t.leaveTypeName === parsed.leaveTypeName)?.leaveTypeId ?? "LT-OTHER",
    leaveTypeName: parsed.leaveTypeName,
    startDate: parsed.startDate,
    endDate: parsed.endDate,
    totalDays: parsed.totalDays,
    reason: parsed.reason,
    status: parsed.status as LeaveStatus,
    appliedOn: parsed.appliedOn,
    approvedOn: parsed.approvedOn,
    approvedBy: parsed.approvedByName,
    // No equivalent column on the schema's LeaveRequests table.
    remarks: null,
  };
}

// ---- Leave — full CRUD at /leave-requests -----------------------------------
export const leaveApi = {
  // No `LeaveType` table exists in the schema (leave_type is a free-text
  // column on LeaveRequests) — this list is the fixed set of values the
  // UI offers, kept purely client-side.
  getLeaveTypes: () => Promise.resolve<LeaveType[]>(leaveTypes),

  // Leave balance (allocated/used/remaining) isn't modeled anywhere in the
  // schema either — there's no table to compute it from server-side, so
  // this stays on demo data until the backend adds that concept.
  getBalance: () => mockLeaveApi.getBalance(),

  // The live `GET /leave-requests` route takes no query params (findAll()
  // ignores them, same as `/attendance` and `/users`), so filtering to the
  // current employee happens client-side after fetching the full list.
  getMyLeaves: () =>
    withDemoFallback<LeaveRequest[]>(
      async () => {
        const employeeId = currentEmployeeId();
        const rows = toArray(await apiRequest<any>(ENDPOINTS.leaveRequests.base));
        return rows
          .map(adaptLeaveRow)
          .filter((r) => r.employeeId === employeeId)
          .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));
      },
      () => mockLeaveApi.getMyLeaves(),
    ),

  // Confirmed POST body (per the live Swagger doc): leave_type, start_date,
  // end_date, reason, status, user_id, approved_by_id — snake_case, and the
  // employee reference is `user_id`, not `employeeId`.
  applyLeave: (payload: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) =>
    withDemoFallback<LeaveRequest>(
      async () => {
        const employeeId = currentEmployeeId();
        const leaveTypeName = leaveTypes.find((t) => t.leaveTypeId === payload.leaveTypeId)?.leaveTypeName ?? "Leave";
        const created = await apiRequest<any>(ENDPOINTS.leaveRequests.base, {
          method: "POST",
          body: {
            user_id: employeeId,
            leave_type: leaveTypeName,
            start_date: payload.startDate,
            end_date: payload.endDate,
            reason: payload.reason,
            status: "Pending",
          },
        });
        return adaptLeaveRow(created);
      },
      () => mockLeaveApi.applyLeave(payload),
    ),
};

// ---- Payroll — confirmed live REST at /payroll -----------------------------
// Confirmed against the live Swagger doc: `GET /api/payroll` returns every
// payroll row (basic_salary/allowance/bonus/deduction/tax/net_salary as
// numeric strings, `payroll_month` as a first-of-month date string, and the
// employee nested under `user`) with no `?employeeId=` filter — same
// situation as `/attendance` and `/leave-requests`, so filtering to the
// current employee happens client-side after fetching the full list. There's
// no separate pay-components table exposed, so the itemized breakdown shown
// in the UI is synthesized from the flat columns (see payrollAdapter.ts).
function toPayrollRecord(row: ParsedPayrollRow): PayrollRecord {
  const components: PayrollRecord["components"] = [
    { payComponentId: `${row.payrollId}-basic`, payrollId: row.payrollId, componentName: "Basic Salary", componentType: "Earning", amount: row.basicSalary },
    { payComponentId: `${row.payrollId}-allowance`, payrollId: row.payrollId, componentName: "Allowance", componentType: "Earning", amount: row.allowance },
    ...(row.bonus > 0
      ? [{ payComponentId: `${row.payrollId}-bonus`, payrollId: row.payrollId, componentName: "Bonus", componentType: "Earning" as const, amount: row.bonus }]
      : []),
    { payComponentId: `${row.payrollId}-deduction`, payrollId: row.payrollId, componentName: "Deduction", componentType: "Deduction", amount: row.deduction },
    { payComponentId: `${row.payrollId}-tax`, payrollId: row.payrollId, componentName: "Tax", componentType: "Deduction", amount: row.tax },
  ];
  return {
    payrollId: row.payrollId,
    employeeId: row.employeeId,
    payrollMonth: row.payrollMonth,
    payrollYear: row.payrollYear,
    basicSalary: row.basicSalary,
    allowance: row.allowance,
    bonus: row.bonus,
    deduction: row.deduction,
    tax: row.tax,
    netSalary: row.netSalary,
    paymentDate: row.paymentDate,
    generatedDate: row.paymentDate ?? new Date().toISOString().slice(0, 10),
    status: row.status,
    components,
  };
}

async function fetchAllPayroll(): Promise<ParsedPayrollRow[]> {
  const rows = await apiRequest<any>(ENDPOINTS.payroll.base);
  return (Array.isArray(rows) ? rows : (rows?.data ?? [])).map(parsePayrollRow);
}

export const payrollApi = {
  getMyPayroll: () =>
    withDemoFallback<PayrollRecord[]>(
      async () => {
        const employeeId = currentEmployeeId();
        const rows = await fetchAllPayroll();
        return rows
          .filter((r) => r.employeeId === employeeId)
          .sort((a, b) => (a.payrollYear !== b.payrollYear ? b.payrollYear - a.payrollYear : b.payrollMonth - a.payrollMonth))
          .map(toPayrollRecord);
      },
      () => mockPayrollApi.getMyPayroll(),
    ),

  getPayslip: (payrollId: string) =>
    withDemoFallback<PayrollRecord>(
      async () => {
        const row = await apiRequest<any>(ENDPOINTS.payroll.byId(payrollId));
        return toPayrollRecord(parsePayrollRow(row));
      },
      () => mockPayrollApi.getPayslip(payrollId),
    ),
};

// ---- Appraisal — no REST controller in the Swagger doc yet -----------------
// Schema has `AppraisalQuestions` + `PerformanceReviews`; same situation as
// Payroll above — kept schema-shaped, demo data until the backend catches up.
export const appraisalApi = {
  getMyAppraisals: () =>
    withDemoFallback<AppraisalRecord[]>(
      () => apiRequest<AppraisalRecord[]>(`${ENDPOINTS.performanceReviews.base}?employeeId=${currentEmployeeId()}`),
      () => mockAppraisalApi.getMyAppraisals(),
    ),

  getAppraisalDetail: (appraisalId: string) =>
    withDemoFallback<AppraisalRecord>(
      () => apiRequest<AppraisalRecord>(ENDPOINTS.performanceReviews.byId(appraisalId)),
      () => mockAppraisalApi.getAppraisalDetail(appraisalId),
    ),
};

// ---- Notifications — confirmed live REST CRUD at /notifications -----------
// Confirmed against the live Swagger doc: `POST /api/notifications` takes
// `{ title, message, type, createdBy }` (createdBy is the creating user's
// user_id) and `GET /api/notifications` returns every notification with the
// full `createdBy` user nested inside — there is no `?employeeId=` filter,
// no `isRead` column, and no dedicated "mark all read" route. In other
// words the schema models company-wide broadcasts (Admin/HR → everyone),
// not per-recipient inbox rows. `GET`'s example response also doesn't echo
// back the `type` it was created with, so the adapter below defaults to
// "General" when it's missing rather than assuming the field is dropped
// server-side for good.
function adaptNotificationRow(row: any): NotificationRecord {
  const createdBy = row?.createdBy ?? null;
  const createdByName = createdBy ? `${createdBy.first_name ?? ""} ${createdBy.last_name ?? ""}`.trim() : undefined;
  return {
    notificationId: String(row?.notification_id ?? row?.notificationId ?? row?.id ?? ""),
    title: row?.title ?? "",
    message: row?.message ?? "",
    type: (row?.type as NotificationType) ?? "General",
    isRead: false, // stitched in client-side by NotificationsContext (see there for why)
    createdAt: row?.created_at ?? row?.createdAt ?? new Date().toISOString(),
    createdById: createdBy?.user_id,
    createdByName: createdByName || undefined,
  };
}

export const notificationApi = {
  getAll: () =>
    withDemoFallback<NotificationRecord[]>(
      async () => {
        const rows = toArray(await apiRequest<any>(ENDPOINTS.notifications.base));
        return rows.map(adaptNotificationRow).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      },
      () => mockNotificationApi.getAll(),
    ),

  // `createdBy` defaults to the signed-in user (matches the confirmed
  // Swagger example body), but is accepted as an override for admin
  // "send on behalf of" tooling if that's ever added.
  create: (payload: { title: string; message: string; type: NotificationType; createdBy?: string }) =>
    withDemoFallback<NotificationRecord>(
      async () => {
        const created = await apiRequest<any>(ENDPOINTS.notifications.base, {
          method: "POST",
          body: {
            title: payload.title,
            message: payload.message,
            type: payload.type,
            createdBy: payload.createdBy ?? currentEmployeeId(),
          },
        });
        return adaptNotificationRow(created);
      },
      () => mockNotificationApi.create({ ...payload, createdById: currentEmployeeId() }),
    ),

  update: (notificationId: string, payload: { title: string; message: string; type: NotificationType }) =>
    withDemoFallback<NotificationRecord>(
      async () => {
        const updated = await apiRequest<any>(ENDPOINTS.notifications.byId(notificationId), {
          method: "PATCH",
          body: payload,
        });
        return adaptNotificationRow(updated);
      },
      () => mockNotificationApi.update(notificationId, payload),
    ),

  remove: (notificationId: string) =>
    withDemoFallback<{ notificationId: string }>(
      () => apiRequest<{ notificationId: string }>(ENDPOINTS.notifications.byId(notificationId), { method: "DELETE" }),
      () => mockNotificationApi.remove(notificationId),
    ),
};

export type {
  AttendanceRecord,
  AttendanceStatus,
  LeaveType,
  LeaveRequest,
  LeaveStatus,
  PayrollRecord,
  PayComponent,
  AppraisalRecord,
  AppraisalScoreItem,
  NotificationRecord,
  NotificationType,
} from "@/mocks/hrMockData";
export { monthLabel } from "@/mocks/hrMockData";
