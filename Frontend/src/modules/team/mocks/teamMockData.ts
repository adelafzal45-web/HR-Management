// Hardcoded/demo data for the Phase 2 Team Lead workspace
// (My Team, Team Attendance, Team Leave Requests, Appraisal Criteria,
// Evaluate Employee, Team Reports).
//
// Same contract as hrMockData.ts: used ONLY when the real backend can't be
// reached. Field names stay aligned with the ERD in the project
// documentation (Chapter 6 — Employee, Attendance, Leave, AppraisalQuestion/
// AppraisalScore) so wiring the real NestJS + Prisma endpoints later is a
// drop-in swap.

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n: number) => String(n).padStart(2, "0");

// The logged-in demo user (EMP-1042) is the Team Lead for this squad.
const TEAM_LEAD_ID = "EMP-1042";

// ---------------------------------------------------------------------------
// Team members (subset of `Employee` table, filtered by managerId)
// ---------------------------------------------------------------------------
// Shifts (`Shifts` table) referenced by team members below. Kept in sync by
// name with Settings → Shifts; standardHours drives overtime calculation.
export type ShiftRef = { shiftId: string; name: string; startTime: string; endTime: string; standardHours: number };

export const SHIFT_REFS: Record<string, ShiftRef> = {
 general: { shiftId: "SH-1", name: "General Shift", startTime: "09:00", endTime: "18:00", standardHours: 8 },
 morning: { shiftId: "SH-2", name: "Morning Shift", startTime: "06:00", endTime: "14:00", standardHours: 8 },
 evening: { shiftId: "SH-3", name: "Evening Shift", startTime: "14:00", endTime: "22:00", standardHours: 8 },
};

export type TeamMember = {
 employeeId: string;
 employeeCode: string;
 firstName: string;
 lastName: string;
 email: string;
 designation: string;
 department: string;
 managerId: string;
 joiningDate: string;
 status: "Active" | "On Leave" | "Inactive";
 avatarUrl?: string;
 // New in v2 — `Employees.job_category_id` / `Employees.shift_id`.
 jobCategoryId: string;
 jobCategoryName: string;
 shiftId: string;
 shiftName: string;
 // New in v2 — `Employees.overtime_allowed` (per-employee, not per-shift).
 overtimeAllowed: boolean;
};

const teamMembers: TeamMember[] = [
 {
 employeeId: "EMP-2001",
 employeeCode: "TC-2001",
 firstName: "Ayesha",
 lastName: "Khan",
 email: "ayesha.khan@technocues.com",
 designation: "Frontend Developer",
 department: "Engineering",
 managerId: TEAM_LEAD_ID,
 joiningDate: "2024-02-10",
 status: "Active",
 jobCategoryId: "JC-1",
 jobCategoryName: "Permanent",
 shiftId: SHIFT_REFS.general.shiftId,
 shiftName: SHIFT_REFS.general.name,
 overtimeAllowed: true,
 },
 {
 employeeId: "EMP-2002",
 employeeCode: "TC-2002",
 firstName: "Bilal",
 lastName: "Ahmed",
 email: "bilal.ahmed@technocues.com",
 designation: "Backend Developer",
 department: "Engineering",
 managerId: TEAM_LEAD_ID,
 joiningDate: "2023-11-01",
 status: "Active",
 jobCategoryId: "JC-1",
 jobCategoryName: "Permanent",
 shiftId: SHIFT_REFS.general.shiftId,
 shiftName: SHIFT_REFS.general.name,
 overtimeAllowed: true,
 },
 {
 employeeId: "EMP-2003",
 employeeCode: "TC-2003",
 firstName: "Sara",
 lastName: "Malik",
 email: "sara.malik@technocues.com",
 designation: "QA Engineer",
 department: "Engineering",
 managerId: TEAM_LEAD_ID,
 joiningDate: "2024-06-19",
 status: "On Leave",
 jobCategoryId: "JC-3",
 jobCategoryName: "Probation",
 shiftId: SHIFT_REFS.morning.shiftId,
 shiftName: SHIFT_REFS.morning.name,
 overtimeAllowed: false,
 },
 {
 employeeId: "EMP-2004",
 employeeCode: "TC-2004",
 firstName: "Hamza",
 lastName: "Raza",
 email: "hamza.raza@technocues.com",
 designation: "UI/UX Designer",
 department: "Engineering",
 managerId: TEAM_LEAD_ID,
 joiningDate: "2022-09-05",
 status: "Active",
 jobCategoryId: "JC-1",
 jobCategoryName: "Permanent",
 shiftId: SHIFT_REFS.general.shiftId,
 shiftName: SHIFT_REFS.general.name,
 overtimeAllowed: true,
 },
 {
 employeeId: "EMP-2005",
 employeeCode: "TC-2005",
 firstName: "Noor",
 lastName: "Fatima",
 email: "noor.fatima@technocues.com",
 designation: "Backend Developer",
 department: "Engineering",
 managerId: TEAM_LEAD_ID,
 joiningDate: "2025-01-13",
 status: "Active",
 jobCategoryId: "JC-2",
 jobCategoryName: "Contract",
 shiftId: SHIFT_REFS.evening.shiftId,
 shiftName: SHIFT_REFS.evening.name,
 overtimeAllowed: true,
 },
];

// mockTeamApi.getTeamMembers() was removed — the roster now comes from the real
// GET /appraisal/my-team (see modules/appraisal/api/appraisalApi.ts). The
// `teamMembers` fixture above is still used to synthesize team attendance and
// the team report below.

// ---------------------------------------------------------------------------
// Team Attendance (aggregated over `Attendance` table for the team)
// ---------------------------------------------------------------------------
export type TeamAttendanceStatus = "Present" | "Late" | "Absent" | "Leave";

export type TeamAttendanceDay = {
 attendanceDate: string; // YYYY-MM-DD
 checkIn: string | null;
 checkOut: string | null;
 workingHours: number | null;
 // New in v2 — `Attendance.shift_id`, `Attendance.overtime_hours`, `Attendance.is_overtime`.
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

function seededRoll(seedStr: string) {
 let h = 0;
 for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) % 1000;
 return h / 1000;
}

function hoursBetween(checkIn: string, checkOut: string): number {
 const [inH, inM] = checkIn.split(":").map(Number);
 const [outH, outM] = checkOut.split(":").map(Number);
 return Math.round(((outH * 60 + outM - (inH * 60 + inM)) / 60) * 100) / 100;
}

function withOvertime(
 member: TeamMember,
 base: Pick<TeamAttendanceDay, "attendanceDate" | "checkIn" | "checkOut" | "status">,
): TeamAttendanceDay {
 const shift = Object.values(SHIFT_REFS).find((s) => s.shiftId === member.shiftId) ?? SHIFT_REFS.general;
 const workingHours = base.checkIn && base.checkOut ? hoursBetween(base.checkIn, base.checkOut) : null;
 const extra =
 member.overtimeAllowed && workingHours != null
 ? Math.round(Math.max(0, workingHours - shift.standardHours) * 100) / 100
 : 0;
 return {
 ...base,
 workingHours,
 shiftId: member.shiftId,
 shiftName: member.shiftName,
 overtimeHours: extra > 0 ? extra : null,
 isOvertime: extra > 0,
 };
}

function buildMemberAttendance(member: TeamMember, month: number, year: number): TeamMemberAttendance {
 const days: TeamAttendanceDay[] = [];
 const now = new Date();
 const daysInRange = 22;

 for (let i = 0; i < daysInRange; i++) {
 const d = new Date(year, month - 1, 1);
 d.setDate(d.getDate() + i);
 if (d.getMonth() + 1 !== month) continue;
 if (d > now) continue;
 const dow = d.getDay();
 if (dow === 0 || dow === 6) continue;

 const dateStr = d.toISOString().slice(0, 10);
 const roll = seededRoll(`${member.employeeId}-${dateStr}`);

 if (member.status === "On Leave" && roll < 0.3) {
 days.push(withOvertime(member, { attendanceDate: dateStr, checkIn: null, checkOut: null, status: "Leave" }));
 } else if (roll < 0.06) {
 days.push(withOvertime(member, { attendanceDate: dateStr, checkIn: null, checkOut: null, status: "Absent" }));
 } else if (roll < 0.18) {
 days.push(withOvertime(member, { attendanceDate: dateStr, checkIn: "10:15", checkOut: "18:15", status: "Late" }));
 } else if (roll > 0.85) {
 // Occasionally run a couple of hours past shift end to exercise overtime.
 days.push(withOvertime(member, { attendanceDate: dateStr, checkIn: "09:05", checkOut: "19:40", status: "Present" }));
 } else {
 days.push(withOvertime(member, { attendanceDate: dateStr, checkIn: "09:05", checkOut: "17:10", status: "Present" }));
 }
 }

 const presentDays = days.filter((d) => d.status === "Present").length;
 const lateDays = days.filter((d) => d.status === "Late").length;
 const absentDays = days.filter((d) => d.status === "Absent").length;
 const leaveDays = days.filter((d) => d.status === "Leave").length;
 const attendanceRate = days.length ? Math.round(((presentDays + lateDays) / days.length) * 100) : 100;
 const totalOvertimeHours = Math.round(days.reduce((sum, d) => sum + (d.overtimeHours ?? 0), 0) * 100) / 100;

 return {
 employeeId: member.employeeId,
 name: `${member.firstName} ${member.lastName}`,
 designation: member.designation,
 shiftName: member.shiftName,
 overtimeAllowed: member.overtimeAllowed,
 today: days[days.length - 1] ?? null,
 presentDays,
 lateDays,
 absentDays,
 leaveDays,
 attendanceRate,
 totalOvertimeHours,
 days,
 };
}

export const mockTeamAttendanceApi = {
 async getTeamAttendance(params: { month: number; year: number }): Promise<TeamMemberAttendance[]> {
 await delay(450);
 return teamMembers.map((m) => buildMemberAttendance(m, params.month, params.year));
 },
};

// ---------------------------------------------------------------------------
// Team Leave Requests (view-only for Team Lead — `Leave` table)
// ---------------------------------------------------------------------------
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

const teamLeaveRequests: TeamLeaveRequest[] = [
 {
 leaveId: "LV-3001",
 employeeId: "EMP-2003",
 employeeName: "Sara Malik",
 leaveTypeName: "Sick Leave",
 startDate: "2026-07-20",
 endDate: "2026-07-24",
 totalDays: 5,
 reason: "Recovering from flu, doctor advised rest.",
 status: "Approved",
 appliedOn: "2026-07-19T08:40:00Z",
 },
 {
 leaveId: "LV-3002",
 employeeId: "EMP-2001",
 employeeName: "Ayesha Khan",
 leaveTypeName: "Annual Leave",
 startDate: "2026-08-03",
 endDate: "2026-08-05",
 totalDays: 3,
 reason: "Sister's wedding, out of city.",
 status: "Pending",
 appliedOn: "2026-07-21T13:12:00Z",
 },
 {
 leaveId: "LV-3003",
 employeeId: "EMP-2004",
 employeeName: "Hamza Raza",
 leaveTypeName: "Casual Leave",
 startDate: "2026-07-15",
 endDate: "2026-07-15",
 totalDays: 1,
 reason: "Personal errand.",
 status: "Approved",
 appliedOn: "2026-07-12T09:00:00Z",
 },
 {
 leaveId: "LV-3004",
 employeeId: "EMP-2002",
 employeeName: "Bilal Ahmed",
 leaveTypeName: "Casual Leave",
 startDate: "2026-07-27",
 endDate: "2026-07-28",
 totalDays: 2,
 reason: "Moving apartments.",
 status: "Pending",
 appliedOn: "2026-07-21T17:50:00Z",
 },
 {
 leaveId: "LV-3005",
 employeeId: "EMP-2005",
 employeeName: "Noor Fatima",
 leaveTypeName: "Annual Leave",
 startDate: "2026-06-18",
 endDate: "2026-06-20",
 totalDays: 3,
 reason: "Family travel.",
 status: "Rejected",
 appliedOn: "2026-06-10T10:20:00Z",
 },
];

export const mockTeamLeaveApi = {
 async getTeamLeaveRequests(): Promise<TeamLeaveRequest[]> {
 await delay(350);
 return [...teamLeaveRequests].sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));
 },
};

// ---------------------------------------------------------------------------
// Appraisal Criteria (`AppraisalQuestion`-style table)
// ---------------------------------------------------------------------------
export type AppraisalQuestion = {
 questionId: string;
 questionText: string;
 weightage: number; // percentage; all active questions must sum to 100
 isActive: boolean;
};

// mockAppraisalCriteriaApi and mockEvaluationApi were removed, along with the
// `appraisalCriteria` rubric fixture they served — the rubric and the
// evaluation flow now go through the real /appraisal/* facade (see
// modules/appraisal/api/appraisalApi.ts), so there is nothing left here for a
// screen to fall back to. The `completedEvaluations` fixture below survives
// only because mockTeamReportsApi still synthesizes the team average and top
// performers from it; it goes away with /team/reports.
const completedEvaluations: Record<string, { employeeId: string; totalScore: number }> = {
 "EMP-2004": { employeeId: "EMP-2004", totalScore: 8.6 },
};

// ---------------------------------------------------------------------------
// Team Reports (aggregates across Attendance / Leave / Appraisal for the team)
// ---------------------------------------------------------------------------
export type TeamReportData = {
 reviewPeriod: string;
 teamSize: number;
 avgAttendanceRate: number;
 totalLeaveDaysTaken: number;
 pendingLeaveRequests: number;
 avgAppraisalScore: number;
 evaluatedCount: number;
 totalOvertimeHours: number; // NEW (v2) — sums Attendance.overtime_hours across the team
 topPerformers: { employeeId: string; name: string; score: number }[];
 attendanceByMember: { employeeId: string; name: string; attendanceRate: number }[];
};

export const mockTeamReportsApi = {
 async getTeamReports(): Promise<TeamReportData> {
 await delay(500);
 const now = new Date();
 const attendance = teamMembers.map((m) => buildMemberAttendance(m, now.getMonth() + 1, now.getFullYear()));

 const avgAttendanceRate = Math.round(
 attendance.reduce((sum, a) => sum + a.attendanceRate, 0) / (attendance.length || 1),
 );
 const totalOvertimeHours = Math.round(attendance.reduce((sum, a) => sum + a.totalOvertimeHours, 0) * 100) / 100;
 const totalLeaveDaysTaken = teamLeaveRequests
 .filter((l) => l.status === "Approved")
 .reduce((sum, l) => sum + l.totalDays, 0);
 const pendingLeaveRequests = teamLeaveRequests.filter((l) => l.status === "Pending").length;

 const evaluations = Object.values(completedEvaluations);
 const avgAppraisalScore = evaluations.length
 ? Math.round((evaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length) * 10) / 10
 : 0;

 const topPerformers = evaluations
 .map((e) => {
 const member = teamMembers.find((m) => m.employeeId === e.employeeId);
 return { employeeId: e.employeeId, name: member ? `${member.firstName} ${member.lastName}` : e.employeeId, score: e.totalScore };
 })
 .sort((a, b) => b.score - a.score);

 return {
 reviewPeriod: `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][now.getMonth()]} ${now.getFullYear()}`,
 teamSize: teamMembers.length,
 avgAttendanceRate,
 totalLeaveDaysTaken,
 pendingLeaveRequests,
 avgAppraisalScore,
 evaluatedCount: evaluations.length,
 totalOvertimeHours,
 topPerformers,
 attendanceByMember: attendance.map((a) => ({
 employeeId: a.employeeId,
 name: a.name,
 attendanceRate: a.attendanceRate,
 })),
 };
 },
};

export function monthYearNow() {
 const now = new Date();
 return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export { pad, delay };
