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
// client-side. Payroll, Appraisal and Notifications have DB tables in the
// ERD but no REST controller in the Swagger doc yet — those paths are kept
// schema-shaped (plural of the table name, same convention as every
// confirmed route) so they start working the moment the backend adds them;
// until then the 404 handler in api.ts routes them to demo data.

import { apiRequest, withDemoFallback } from "./api";
import { getSession } from "./auth";
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
} from "./hrMockData";

function currentEmployeeId(): string | undefined {
  return getSession()?.user.employeeId;
}

// Backend responses may come back either as a bare array or as the
// `{ data, total }` list envelope used elsewhere in this app (see
// settingsApi.ts / employeeApi.ts) — normalize both to an array.
function toArray<T>(res: T[] | { data: T[] }): T[] {
  return Array.isArray(res) ? res : (res?.data ?? []);
}

// Reads a field under either casing so this keeps working whichever the
// live DTOs turn out to use — the ERD documents snake_case column names,
// but Nest/Prisma responses are more commonly serialized as camelCase.
function field<T = unknown>(row: any, camel: string, snake: string): T {
  return row?.[camel] ?? row?.[snake];
}

// Adapts one row from `GET /attendance` (schema: attendance_id, employee_id,
// shift_id, attendance_date, check_in, check_out, working_hours,
// overtime_hours, is_overtime, attendance_status) to the frontend's
// AttendanceRecord shape.
function adaptAttendanceRow(row: any): AttendanceRecord {
  return {
    attendanceId: field(row, "attendanceId", "attendance_id"),
    employeeId: field(row, "employeeId", "employee_id"),
    shiftId: field(row, "shiftId", "shift_id") ?? "",
    shiftName: field(row, "shiftName", "shift_name") ?? "—",
    attendanceDate: field(row, "attendanceDate", "attendance_date"),
    checkIn: field(row, "checkIn", "check_in") ?? null,
    checkOut: field(row, "checkOut", "check_out") ?? null,
    workingHours: field(row, "workingHours", "working_hours") ?? null,
    overtimeHours: field(row, "overtimeHours", "overtime_hours") ?? null,
    isOvertime: !!field(row, "isOvertime", "is_overtime"),
    status: (field(row, "attendanceStatus", "attendance_status") ?? "Present") as AttendanceStatus,
  };
}

// ---- Attendance — full CRUD at /attendance ---------------------------------
export const attendanceApi = {
  getToday: () =>
    withDemoFallback<AttendanceRecord | null>(
      async () => {
        const employeeId = currentEmployeeId();
        const today = new Date().toISOString().slice(0, 10);
        const rows = toArray(await apiRequest<any>(`/attendance?employeeId=${employeeId}&date=${today}`));
        const match = rows.find((r) => field(r, "attendanceDate", "attendance_date") === today) ?? rows[0];
        return match ? adaptAttendanceRow(match) : null;
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
        const created = await apiRequest<any>("/attendance", {
          method: "POST",
          body: {
            employeeId,
            attendanceDate: now.toISOString().slice(0, 10),
            checkIn: `${hh}:${mm}`,
            attendanceStatus: now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15) ? "Late" : "Present",
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
        const updated = await apiRequest<any>(`/attendance/${today.attendanceId}`, {
          method: "PATCH",
          body: { checkOut: `${hh}:${mm}` },
        });
        return adaptAttendanceRow(updated);
      },
      () => mockAttendanceApi.checkOut(),
    ),

  // The live API has no `?month=&year=` filter, so pull the employee's
  // records and narrow to the requested month client-side.
  getHistory: (params: { month: number; year: number }) =>
    withDemoFallback<AttendanceRecord[]>(
      async () => {
        const employeeId = currentEmployeeId();
        const rows = toArray(await apiRequest<any>(`/attendance?employeeId=${employeeId}`)).map(adaptAttendanceRow);
        return rows.filter((r) => {
          const d = new Date(r.attendanceDate);
          return d.getMonth() + 1 === params.month && d.getFullYear() === params.year;
        });
      },
      () => mockAttendanceApi.getHistory(params),
    ),
};

// Adapts one row from `GET /leave-requests` (schema: leave_id, employee_id,
// approved_by, leave_type, start_date, end_date, reason, status,
// applied_date, approved_date) to the frontend's LeaveRequest shape. The
// schema stores `leave_type` as a plain string (there's no LeaveType table),
// so leaveTypeId is derived from it rather than coming from the backend.
function adaptLeaveRow(row: any): LeaveRequest {
  const leaveTypeName = field<string>(row, "leaveType", "leave_type") ?? "Leave";
  const start = field<string>(row, "startDate", "start_date");
  const end = field<string>(row, "endDate", "end_date");
  const totalDays =
    start && end ? Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1 : 0;
  return {
    leaveId: field(row, "leaveId", "leave_id"),
    employeeId: field(row, "employeeId", "employee_id"),
    leaveTypeId: leaveTypes.find((t) => t.leaveTypeName === leaveTypeName)?.leaveTypeId ?? "LT-OTHER",
    leaveTypeName,
    startDate: start,
    endDate: end,
    totalDays,
    reason: field(row, "reason", "reason") ?? "",
    status: (field(row, "status", "status") ?? "Pending") as LeaveStatus,
    appliedOn: field(row, "appliedDate", "applied_date"),
    approvedOn: field(row, "approvedDate", "approved_date") ?? null,
    approvedBy: field(row, "approvedBy", "approved_by") ?? null,
    // No equivalent column on the schema's LeaveRequests table.
    remarks: field(row, "remarks", "remarks") ?? null,
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

  getMyLeaves: () =>
    withDemoFallback<LeaveRequest[]>(
      async () => {
        const employeeId = currentEmployeeId();
        const rows = toArray(await apiRequest<any>(`/leave-requests?employeeId=${employeeId}`));
        return rows.map(adaptLeaveRow).sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));
      },
      () => mockLeaveApi.getMyLeaves(),
    ),

  applyLeave: (payload: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) =>
    withDemoFallback<LeaveRequest>(
      async () => {
        const employeeId = currentEmployeeId();
        const leaveTypeName = leaveTypes.find((t) => t.leaveTypeId === payload.leaveTypeId)?.leaveTypeName ?? "Leave";
        const created = await apiRequest<any>("/leave-requests", {
          method: "POST",
          body: {
            employeeId,
            leaveType: leaveTypeName,
            startDate: payload.startDate,
            endDate: payload.endDate,
            reason: payload.reason,
            status: "Pending",
          },
        });
        return adaptLeaveRow(created);
      },
      () => mockLeaveApi.applyLeave(payload),
    ),
};

// ---- Payroll — no REST controller in the Swagger doc yet -------------------
// `Payroll` is a real table in the schema, but nothing exposes it over HTTP
// today. Path kept schema-shaped (plural table name, same convention as the
// confirmed routes) so it activates automatically once the backend adds it.
export const payrollApi = {
  getMyPayroll: () =>
    withDemoFallback<PayrollRecord[]>(
      () => apiRequest<PayrollRecord[]>(`/payroll?employeeId=${currentEmployeeId()}`),
      () => mockPayrollApi.getMyPayroll(),
    ),

  getPayslip: (payrollId: string) =>
    withDemoFallback<PayrollRecord>(
      () => apiRequest<PayrollRecord>(`/payroll/${payrollId}`),
      () => mockPayrollApi.getPayslip(payrollId),
    ),
};

// ---- Appraisal — no REST controller in the Swagger doc yet -----------------
// Schema has `AppraisalQuestions` + `PerformanceReviews`; same situation as
// Payroll above — kept schema-shaped, demo data until the backend catches up.
export const appraisalApi = {
  getMyAppraisals: () =>
    withDemoFallback<AppraisalRecord[]>(
      () => apiRequest<AppraisalRecord[]>(`/performance-reviews?employeeId=${currentEmployeeId()}`),
      () => mockAppraisalApi.getMyAppraisals(),
    ),

  getAppraisalDetail: (appraisalId: string) =>
    withDemoFallback<AppraisalRecord>(
      () => apiRequest<AppraisalRecord>(`/performance-reviews/${appraisalId}`),
      () => mockAppraisalApi.getAppraisalDetail(appraisalId),
    ),
};

// ---- Notifications — no REST controller in the Swagger doc yet ------------
export const notificationApi = {
  getMyNotifications: () =>
    withDemoFallback<NotificationRecord[]>(
      () => apiRequest<NotificationRecord[]>(`/notifications?employeeId=${currentEmployeeId()}`),
      () => mockNotificationApi.getMyNotifications(),
    ),

  markAsRead: (notificationId: string) =>
    withDemoFallback<NotificationRecord>(
      () => apiRequest<NotificationRecord>(`/notifications/${notificationId}`, { method: "PATCH", body: { isRead: true } }),
      () => mockNotificationApi.markAsRead(notificationId),
    ),

  markAllAsRead: () =>
    withDemoFallback<{ updated: number }>(
      () => apiRequest<{ updated: number }>("/notifications/read-all", { method: "PATCH" }),
      () => mockNotificationApi.markAllAsRead(),
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
} from "./hrMockData";
export { monthLabel } from "./hrMockData";
