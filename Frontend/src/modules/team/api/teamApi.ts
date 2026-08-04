// API modules for the Team Lead workspace screens that are NOT part of the
// appraisal flow: Team Attendance, Team Leave Requests, Team Reports.
//
// The appraisal screens (My Team, Evaluation Rubric, Evaluate Employee) moved to
// modules/appraisal/api/appraisalApi.ts, which talks to the real
// /appraisal/* facade with no demo fallback. The roster, criteria and evaluation
// entries that used to live here pointed at /team/members and
// /appraisal/criteria — both removed from the backend — so they silently served
// mock data instead of failing. They have been deleted.
//
// Same contract as hrApi.ts: every call below tries the real NestJS backend
// first (apiRequest, which pings /health and attaches the JWT) and only falls
// back to hardcoded demo data when the backend is completely unreachable. Real
// backend errors are never swallowed — only "can't reach the API at all"
// triggers the fallback.

import { apiRequest, withDemoFallback } from "@/api/client";
import {
 mockTeamAttendanceApi,
 mockTeamLeaveApi,
 mockTeamReportsApi,
 type TeamMemberAttendance,
 type TeamLeaveRequest,
 type TeamReportData,
} from "@/modules/team/mocks/teamMockData";

// ---- Team Attendance — GET /team/attendance --------------------------------
export const teamAttendanceApi = {
 getTeamAttendance: (params: { month: number; year: number }) =>
 withDemoFallback<TeamMemberAttendance[]>(
 () => apiRequest<TeamMemberAttendance[]>(`/team/attendance?month=${params.month}&year=${params.year}`),
 () => mockTeamAttendanceApi.getTeamAttendance(params),
 ),
};

// ---- Team Leave Requests — GET /team/leaves (view-only) --------------------
export const teamLeaveApi = {
 getTeamLeaveRequests: () =>
 withDemoFallback<TeamLeaveRequest[]>(
 () => apiRequest<TeamLeaveRequest[]>("/team/leaves"),
 () => mockTeamLeaveApi.getTeamLeaveRequests(),
 ),
};

// ---- Team Reports — GET /team/reports --------------------------------------
export const teamReportsApi = {
 getTeamReports: () =>
 withDemoFallback<TeamReportData>(
 () => apiRequest<TeamReportData>("/team/reports"),
 () => mockTeamReportsApi.getTeamReports(),
 ),
};

export type {
 TeamMemberAttendance,
 TeamAttendanceDay,
 TeamAttendanceStatus,
 TeamLeaveRequest,
 TeamLeaveStatus,
 TeamReportData,
} from "@/modules/team/mocks/teamMockData";
export { monthYearNow } from "@/modules/team/mocks/teamMockData";
