// API modules for the Phase 2 Team Lead workspace screens:
// My Team, Team Attendance, Team Leave Requests, Appraisal Criteria,
// Evaluate Employee, Team Reports.
//
// Same contract as hrApi.ts: every call tries the real NestJS backend first
// (apiRequest, which pings /health and attaches the JWT) and only falls back
// to hardcoded demo data when the backend is completely unreachable. Real
// backend errors (e.g. "total weightage must equal 100%", "score out of
// range") are never swallowed — only "can't reach the API at all" triggers
// the fallback.
//
// Endpoint paths below are proposed REST routes matching the NestJS + Prisma
// design in the documentation (Chapter 5/6, Employee/Attendance/Leave/
// AppraisalQuestion/AppraisalScore). Adjust the path strings if your
// controllers use different names — everything else stays the same. See
// BACKEND_CONTRACT.md for the full request/response shapes.

import { apiRequest, withDemoFallback } from "./api";
import {
  mockTeamApi,
  mockTeamAttendanceApi,
  mockTeamLeaveApi,
  mockAppraisalCriteriaApi,
  mockEvaluationApi,
  mockTeamReportsApi,
  type TeamMember,
  type TeamMemberAttendance,
  type TeamLeaveRequest,
  type AppraisalQuestion,
  type EvaluationScoreInput,
  type SubmittedEvaluation,
  type TeamReportData,
} from "./teamMockData";

// ---- My Team — GET /team/members -------------------------------------------
export const teamApi = {
  getTeamMembers: () =>
    withDemoFallback<TeamMember[]>(
      () => apiRequest<TeamMember[]>("/team/members"),
      () => mockTeamApi.getTeamMembers(),
    ),
};

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

// ---- Appraisal Criteria — GET/PUT /appraisal/criteria ----------------------
export const appraisalCriteriaApi = {
  getCriteria: () =>
    withDemoFallback<AppraisalQuestion[]>(
      () => apiRequest<AppraisalQuestion[]>("/appraisal/criteria"),
      () => mockAppraisalCriteriaApi.getCriteria(),
    ),

  saveCriteria: (questions: Array<Omit<AppraisalQuestion, "questionId"> & { questionId?: string }>) =>
    withDemoFallback<AppraisalQuestion[]>(
      () => apiRequest<AppraisalQuestion[]>("/appraisal/criteria", { method: "PUT", body: { questions } }),
      () => mockAppraisalCriteriaApi.saveCriteria(questions),
    ),
};

// ---- Evaluate Employee — GET/POST /appraisal/evaluate/:employeeId ---------
export const evaluationApi = {
  getEvaluation: (employeeId: string) =>
    withDemoFallback<SubmittedEvaluation | null>(
      () => apiRequest<SubmittedEvaluation | null>(`/appraisal/evaluate/${employeeId}`),
      () => mockEvaluationApi.getEvaluation(employeeId),
    ),

  submitEvaluation: (payload: {
    employeeId: string;
    reviewPeriod: string;
    comments: string;
    recommendation: string;
    scores: EvaluationScoreInput[];
  }) =>
    withDemoFallback<SubmittedEvaluation>(
      () =>
        apiRequest<SubmittedEvaluation>(`/appraisal/evaluate/${payload.employeeId}`, {
          method: "POST",
          body: payload,
        }),
      () => mockEvaluationApi.submitEvaluation(payload),
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
  TeamMember,
  TeamMemberAttendance,
  TeamAttendanceDay,
  TeamAttendanceStatus,
  TeamLeaveRequest,
  TeamLeaveStatus,
  AppraisalQuestion,
  EvaluationScoreInput,
  SubmittedEvaluation,
  TeamReportData,
} from "./teamMockData";
export { monthYearNow } from "./teamMockData";
