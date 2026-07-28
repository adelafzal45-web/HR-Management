// API module for the HR/Administrator operational workspace: org-wide
// Attendance correction and Leave approval.
//
// Same contract as employeeApi.ts/settingsApi.ts: every call tries the real
// NestJS backend first (apiRequest — pings /health, attaches the JWT), and
// only falls back to the in-memory mock store (adminOpsMockData.ts) when the
// backend is completely unreachable.
//
// Live backend routes (per the Swagger doc):
//   GET    /attendance         org-wide list (search, department, status, date, page)
//   PATCH  /attendance/:id     correct a record (checkIn/checkOut/status)
//   GET    /leave-requests     org-wide list (search, department, status, page)
//   PATCH  /leave-requests/:id update a request — used here to set status to
//                              "Approved" / "Rejected" (the Swagger doc has no
//                              dedicated /approve or /reject route, so approve/
//                              reject both go through the generic update).

import { apiRequest, withDemoFallback, normalizeListResult } from "./api";
import {
  mockAdminAttendanceApi,
  mockAdminLeaveApi,
  type AdminAttendanceRecord,
  type AttendanceCorrection,
  type AttendanceListParams,
  type AdminLeaveRequest,
  type LeaveListParams,
  type ListResult,
} from "./adminOpsMockData";

export type {
  AdminAttendanceRecord,
  AdminAttendanceStatus,
  AttendanceCorrection,
  AttendanceListParams,
  AdminLeaveRequest,
  AdminLeaveStatus,
  LeaveListParams,
  ListResult,
} from "./adminOpsMockData";

const attendanceQs = (params: AttendanceListParams) => {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.departmentId) search.set("departmentId", params.departmentId);
  if (params.status) search.set("status", params.status);
  if (params.date) search.set("date", params.date);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const str = search.toString();
  return str ? `?${str}` : "";
};

const leaveQs = (params: LeaveListParams) => {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.departmentId) search.set("departmentId", params.departmentId);
  if (params.status) search.set("status", params.status);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const str = search.toString();
  return str ? `?${str}` : "";
};

export const adminAttendanceApi = {
  list: (params: AttendanceListParams = {}) =>
    withDemoFallback<ListResult<AdminAttendanceRecord>>(
      () => apiRequest<unknown>(`/attendance${attendanceQs(params)}`).then((raw) => normalizeListResult<AdminAttendanceRecord>(raw)),
      () => mockAdminAttendanceApi.list(params),
    ),

  correct: (id: string, payload: AttendanceCorrection) =>
    withDemoFallback<AdminAttendanceRecord>(
      () => apiRequest<AdminAttendanceRecord>(`/attendance/${id}`, { method: "PATCH", body: payload }),
      () => mockAdminAttendanceApi.correct(id, payload),
    ),
};

export const adminLeaveApi = {
  list: (params: LeaveListParams = {}) =>
    withDemoFallback<ListResult<AdminLeaveRequest>>(
      () => apiRequest<unknown>(`/leave-requests${leaveQs(params)}`).then((raw) => normalizeListResult<AdminLeaveRequest>(raw)),
      () => mockAdminLeaveApi.list(params),
    ),

  approve: (id: string) =>
    withDemoFallback<AdminLeaveRequest>(
      () => apiRequest<AdminLeaveRequest>(`/leave-requests/${id}`, { method: "PATCH", body: { status: "Approved" } }),
      () => mockAdminLeaveApi.setStatus(id, "Approved"),
    ),

  reject: (id: string) =>
    withDemoFallback<AdminLeaveRequest>(
      () => apiRequest<AdminLeaveRequest>(`/leave-requests/${id}`, { method: "PATCH", body: { status: "Rejected" } }),
      () => mockAdminLeaveApi.setStatus(id, "Rejected"),
    ),
};
