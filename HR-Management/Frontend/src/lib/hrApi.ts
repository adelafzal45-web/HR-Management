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
// Endpoint paths below are proposed REST routes matching the NestJS +
// Prisma design in the documentation (Chapter 5/6). Adjust the path strings
// if your controllers use different names — everything else stays the same.

import { apiRequest, withDemoFallback } from "./api";
import {
  mockAttendanceApi,
  mockLeaveApi,
  mockPayrollApi,
  mockAppraisalApi,
  mockNotificationApi,
  type AttendanceRecord,
  type LeaveType,
  type LeaveRequest,
  type PayrollRecord,
  type AppraisalRecord,
  type NotificationRecord,
} from "./hrMockData";

// ---- Attendance — GET/POST /attendance/* -----------------------------------
export const attendanceApi = {
  getToday: () =>
    withDemoFallback<AttendanceRecord | null>(
      () => apiRequest<AttendanceRecord | null>("/attendance/today"),
      () => mockAttendanceApi.getToday(),
    ),

  checkIn: () =>
    withDemoFallback<AttendanceRecord>(
      () => apiRequest<AttendanceRecord>("/attendance/check-in", { method: "POST" }),
      () => mockAttendanceApi.checkIn(),
    ),

  checkOut: () =>
    withDemoFallback<AttendanceRecord>(
      () => apiRequest<AttendanceRecord>("/attendance/check-out", { method: "POST" }),
      () => mockAttendanceApi.checkOut(),
    ),

  getHistory: (params: { month: number; year: number }) =>
    withDemoFallback<AttendanceRecord[]>(
      () => apiRequest<AttendanceRecord[]>(`/attendance/history?month=${params.month}&year=${params.year}`),
      () => mockAttendanceApi.getHistory(params),
    ),
};

// ---- Leave — GET/POST /leave/* ---------------------------------------------
export const leaveApi = {
  getLeaveTypes: () =>
    withDemoFallback<LeaveType[]>(
      () => apiRequest<LeaveType[]>("/leave/types"),
      () => mockLeaveApi.getLeaveTypes(),
    ),

  getBalance: () =>
    withDemoFallback(
      () =>
        apiRequest<
          { leaveTypeId: string; leaveTypeName: string; allocated: number; used: number; pending: number; remaining: number }[]
        >("/leave/balance"),
      () => mockLeaveApi.getBalance(),
    ),

  getMyLeaves: () =>
    withDemoFallback<LeaveRequest[]>(
      () => apiRequest<LeaveRequest[]>("/leave/my"),
      () => mockLeaveApi.getMyLeaves(),
    ),

  applyLeave: (payload: { leaveTypeId: string; startDate: string; endDate: string; reason: string }) =>
    withDemoFallback<LeaveRequest>(
      () => apiRequest<LeaveRequest>("/leave/apply", { method: "POST", body: payload }),
      () => mockLeaveApi.applyLeave(payload),
    ),
};

// ---- Payroll — GET /payroll/* ----------------------------------------------
export const payrollApi = {
  getMyPayroll: () =>
    withDemoFallback<PayrollRecord[]>(
      () => apiRequest<PayrollRecord[]>("/payroll/my"),
      () => mockPayrollApi.getMyPayroll(),
    ),

  getPayslip: (payrollId: string) =>
    withDemoFallback<PayrollRecord>(
      () => apiRequest<PayrollRecord>(`/payroll/${payrollId}/payslip`),
      () => mockPayrollApi.getPayslip(payrollId),
    ),
};

// ---- Appraisal — GET /appraisal/* ------------------------------------------
export const appraisalApi = {
  getMyAppraisals: () =>
    withDemoFallback<AppraisalRecord[]>(
      () => apiRequest<AppraisalRecord[]>("/appraisal/my"),
      () => mockAppraisalApi.getMyAppraisals(),
    ),

  getAppraisalDetail: (appraisalId: string) =>
    withDemoFallback<AppraisalRecord>(
      () => apiRequest<AppraisalRecord>(`/appraisal/${appraisalId}`),
      () => mockAppraisalApi.getAppraisalDetail(appraisalId),
    ),
};

// ---- Notifications — GET/PATCH /notifications/* ---------------------------
export const notificationApi = {
  getMyNotifications: () =>
    withDemoFallback<NotificationRecord[]>(
      () => apiRequest<NotificationRecord[]>("/notifications"),
      () => mockNotificationApi.getMyNotifications(),
    ),

  markAsRead: (notificationId: string) =>
    withDemoFallback<NotificationRecord>(
      () => apiRequest<NotificationRecord>(`/notifications/${notificationId}/read`, { method: "PATCH" }),
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
