// API modules for the Team Lead workspace screens that are NOT part of the
// appraisal flow: Team Attendance, Team Leave Requests, Team Reports.
//
// Talks to the real backend through the shared transport in lib/apiClient
// (JWT bearer, refresh cookie, 401 replay, timeout). There is NO demo/mock
// fallback — a backend error surfaces to the page as an `ApiError` and is
// never swallowed into fabricated team data.
//
// BACKEND GAP — the three routes below (`GET /team/attendance`,
// `GET /team/leaves`, `GET /team/reports`) are NOT implemented: there is no
// `@Controller('team')` anywhere in Backend/src, so every call here currently
// 404s and these three screens will render their error state until the backend
// adds them. They previously "worked" only because the mock fallback
// fabricated data whenever the API was unreachable; that fallback is gone per
// the no-fake-data rule.
//
// The team-lead data the backend DOES expose lives elsewhere and already has
// real, no-fallback clients:
//   • GET /appraisal/my-team  + /appraisal/my-team/stats  (modules/appraisal)
//   • GET /dashboard/team                                 (modules/dashboard)
//   • GET /users/me/team      (a lead's direct reports)
// None of them return the per-day attendance, view-only leave, or aggregate
// report shapes these three screens consume, so they can't be repointed
// without a backend change — hence the gap is reported here rather than papered
// over with a lookalike endpoint.

import { apiRequest } from "@/lib/apiClient";

// ---- Domain model ----------------------------------------------------------
// The camelCase shapes these three screens consume. They live here (not in a
// mock) as this module's own contract — the pages import them from here.

export type TeamAttendanceStatus = "Present" | "Late" | "Absent" | "Leave";

export type TeamAttendanceDay = {
 attendanceDate: string; // YYYY-MM-DD
 checkIn: string | null;
 checkOut: string | null;
 workingHours: number | null;
 shiftId: string;
 shiftName: string;
 overtimeHours: number | null;
 isOvertime: boolean;
 status: TeamAttendanceStatus;
};

export type TeamMemberAttendance = {
 employeeId: string;
 name: string;
 designation: string;
 shiftName: string;
 overtimeAllowed: boolean;
 today: TeamAttendanceDay | null;
 presentDays: number;
 lateDays: number;
 absentDays: number;
 leaveDays: number;
 attendanceRate: number; // 0-100
 totalOvertimeHours: number;
 days: TeamAttendanceDay[];
};

export type TeamLeaveStatus = "Pending" | "Approved" | "Rejected";

export type TeamLeaveRequest = {
 leaveId: string;
 employeeId: string;
 employeeName: string;
 leaveTypeName: string;
 startDate: string;
 endDate: string;
 totalDays: number;
 reason: string;
 status: TeamLeaveStatus;
 appliedOn: string;
};

export type TeamReportData = {
 reviewPeriod: string;
 teamSize: number;
 avgAttendanceRate: number;
 totalLeaveDaysTaken: number;
 pendingLeaveRequests: number;
 avgAppraisalScore: number;
 evaluatedCount: number;
 totalOvertimeHours: number;
 topPerformers: { employeeId: string; name: string; score: number }[];
 attendanceByMember: { employeeId: string; name: string; attendanceRate: number }[];
};

/** Current month/year — the Team Attendance month picker's initial state. */
export function monthYearNow() {
 const now = new Date();
 return { month: now.getMonth() + 1, year: now.getFullYear() };
}

// ---- Team Attendance — GET /team/attendance (see BACKEND GAP above) --------
export const teamAttendanceApi = {
 getTeamAttendance: (params: { month: number; year: number }): Promise<TeamMemberAttendance[]> =>
 apiRequest<TeamMemberAttendance[]>(`/team/attendance?month=${params.month}&year=${params.year}`),
};

// ---- Team Leave Requests — GET /team/leaves (view-only; see BACKEND GAP) ---
export const teamLeaveApi = {
 getTeamLeaveRequests: (): Promise<TeamLeaveRequest[]> =>
 apiRequest<TeamLeaveRequest[]>("/team/leaves"),
};

// ---- Team Reports — GET /team/reports (see BACKEND GAP above) --------------
export const teamReportsApi = {
 getTeamReports: (): Promise<TeamReportData> =>
 apiRequest<TeamReportData>("/team/reports"),
};
