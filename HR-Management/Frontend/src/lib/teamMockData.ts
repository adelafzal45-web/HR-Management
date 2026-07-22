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
  },
];

export const mockTeamApi = {
  async getTeamMembers(): Promise<TeamMember[]> {
    await delay(350);
    return teamMembers;
  },
};

// ---------------------------------------------------------------------------
// Team Attendance (aggregated over `Attendance` table for the team)
// ---------------------------------------------------------------------------
export type TeamAttendanceStatus = "Present" | "Late" | "Absent" | "Leave";

export type TeamAttendanceDay = {
  attendanceDate: string; // YYYY-MM-DD
  checkIn: string | null;
  checkOut: string | null;
  status: TeamAttendanceStatus;
};

export type TeamMemberAttendance = {
  employeeId: string;
  name: string;
  designation: string;
  today: TeamAttendanceDay | null;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  attendanceRate: number; // 0-100
  days: TeamAttendanceDay[];
};

function seededRoll(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) % 1000;
  return h / 1000;
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
      days.push({ attendanceDate: dateStr, checkIn: null, checkOut: null, status: "Leave" });
    } else if (roll < 0.06) {
      days.push({ attendanceDate: dateStr, checkIn: null, checkOut: null, status: "Absent" });
    } else if (roll < 0.18) {
      days.push({ attendanceDate: dateStr, checkIn: "10:15", checkOut: "18:15", status: "Late" });
    } else {
      days.push({ attendanceDate: dateStr, checkIn: "09:05", checkOut: "17:10", status: "Present" });
    }
  }

  const presentDays = days.filter((d) => d.status === "Present").length;
  const lateDays = days.filter((d) => d.status === "Late").length;
  const absentDays = days.filter((d) => d.status === "Absent").length;
  const leaveDays = days.filter((d) => d.status === "Leave").length;
  const attendanceRate = days.length ? Math.round(((presentDays + lateDays) / days.length) * 100) : 100;

  return {
    employeeId: member.employeeId,
    name: `${member.firstName} ${member.lastName}`,
    designation: member.designation,
    today: days[days.length - 1] ?? null,
    presentDays,
    lateDays,
    absentDays,
    leaveDays,
    attendanceRate,
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

let appraisalCriteria: AppraisalQuestion[] = [
  { questionId: "Q-1", questionText: "Job Knowledge", weightage: 25, isActive: true },
  { questionId: "Q-2", questionText: "Quality of Work", weightage: 25, isActive: true },
  { questionId: "Q-3", questionText: "Communication", weightage: 20, isActive: true },
  { questionId: "Q-4", questionText: "Teamwork", weightage: 15, isActive: true },
  { questionId: "Q-5", questionText: "Punctuality", weightage: 15, isActive: true },
];

export const mockAppraisalCriteriaApi = {
  async getCriteria(): Promise<AppraisalQuestion[]> {
    await delay(300);
    return appraisalCriteria;
  },

  async saveCriteria(
    questions: Array<Omit<AppraisalQuestion, "questionId"> & { questionId?: string }>,
  ): Promise<AppraisalQuestion[]> {
    await delay(450);
    const total = questions.reduce((sum, q) => sum + (q.isActive ? q.weightage : 0), 0);
    if (total !== 100) {
      throw new Error(`Total weightage must equal 100% (currently ${total}%).`);
    }
    appraisalCriteria = questions.map((q, i) => ({
      questionId: q.questionId ?? `Q-${Date.now()}-${i}`,
      questionText: q.questionText,
      weightage: q.weightage,
      isActive: q.isActive,
    }));
    return appraisalCriteria;
  },
};

// ---------------------------------------------------------------------------
// Evaluate Employee (`Appraisal` + `AppraisalScore` tables)
// ---------------------------------------------------------------------------
export type EvaluationScoreInput = { questionId: string; score: number; remarks?: string };

export type SubmittedEvaluation = {
  appraisalId: string;
  employeeId: string;
  reviewDate: string;
  reviewPeriod: string;
  totalScore: number;
  comments: string;
  recommendation: string;
  status: "Completed";
  scores: {
    scoreId: string;
    questionId: string;
    criteriaName: string;
    weightage: number;
    score: number;
    remarks: string | null;
  }[];
};

// Employees already evaluated this cycle (so the Team Lead sees prior results
// instead of re-scoring from zero every time).
const completedEvaluations: Record<string, SubmittedEvaluation> = {
  "EMP-2004": {
    appraisalId: "AP-2026-H1-2004",
    employeeId: "EMP-2004",
    reviewDate: "2026-07-05",
    reviewPeriod: "Jan – Jun 2026",
    totalScore: 8.6,
    comments: "Consistently strong design output, mentors juniors well.",
    recommendation: "Recommended for a performance increment.",
    status: "Completed",
    scores: appraisalCriteria.map((q, i) => ({
      scoreId: `AS-${i}-2004`,
      questionId: q.questionId,
      criteriaName: q.questionText,
      weightage: q.weightage,
      score: 8 + (i % 3) * 0.4,
      remarks: null,
    })),
  },
};

export const mockEvaluationApi = {
  async getEvaluation(employeeId: string): Promise<SubmittedEvaluation | null> {
    await delay(250);
    return completedEvaluations[employeeId] ?? null;
  },

  async submitEvaluation(payload: {
    employeeId: string;
    reviewPeriod: string;
    comments: string;
    recommendation: string;
    scores: EvaluationScoreInput[];
  }): Promise<SubmittedEvaluation> {
    await delay(500);

    if (payload.scores.length < appraisalCriteria.filter((q) => q.isActive).length) {
      throw new Error("Please score every criterion before submitting.");
    }
    if (payload.scores.some((s) => s.score < 1 || s.score > 10)) {
      throw new Error("Each score must be between 1 and 10.");
    }

    const totalScore =
      Math.round(
        payload.scores.reduce((sum, s) => {
          const criteria = appraisalCriteria.find((q) => q.questionId === s.questionId);
          return sum + (criteria ? (s.score * criteria.weightage) / 100 : 0);
        }, 0) * 10,
      ) / 10;

    const appraisalId = `AP-${Date.now()}`;
    const result: SubmittedEvaluation = {
      appraisalId,
      employeeId: payload.employeeId,
      reviewDate: new Date().toISOString().slice(0, 10),
      reviewPeriod: payload.reviewPeriod,
      totalScore,
      comments: payload.comments,
      recommendation: payload.recommendation,
      status: "Completed",
      scores: payload.scores.map((s, i) => {
        const criteria = appraisalCriteria.find((q) => q.questionId === s.questionId);
        return {
          scoreId: `${appraisalId}-S${i}`,
          questionId: s.questionId,
          criteriaName: criteria?.questionText ?? "Unknown",
          weightage: criteria?.weightage ?? 0,
          score: s.score,
          remarks: s.remarks ?? null,
        };
      }),
    };

    completedEvaluations[payload.employeeId] = result;
    return result;
  },
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
