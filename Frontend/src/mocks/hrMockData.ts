// Hardcoded/demo data for the Phase 1 employee self-service modules
// (Attendance, Leave, Payroll, Appraisal, Notifications).
//
// Used ONLY when the real backend can't be reached — same pattern as
// mockData.ts for auth/profile. Field names are deliberately kept aligned
// with the ERD in the project documentation (Chapter 6) so wiring up the
// real NestJS + Prisma endpoints later is a drop-in swap, not a rewrite.

const delay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

const todayIso = () => new Date().toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Attendance  (maps to the `Attendance` table)
// ---------------------------------------------------------------------------
// "Half-Day" / "On Leave" are the extra values the live backend actually
// sends on `attendance_status`, alongside the original demo-only set.
export type AttendanceStatus = "Present" | "Late" | "Absent" | "Leave" | "Holiday" | "Half-Day" | "On Leave";

// Shift (`Shifts` table) this employee is scheduled against. Standard hours
// are derived from start/end time and used to compute overtime.
const EMPLOYEE_SHIFT = { shiftId: "SH-1", shiftName: "General Shift", startTime: "09:00", endTime: "18:00" };
const STANDARD_SHIFT_HOURS = 8;

// `Employees.overtime_allowed` — a per-employee flag (not per-shift). When
// false, hours worked beyond the shift are never marked as overtime.
const EMPLOYEE_OVERTIME_ALLOWED = true;

export type AttendanceRecord = {
  attendanceId: string;
  employeeId: string;
  shiftId: string;
  shiftName: string;
  attendanceDate: string; // YYYY-MM-DD
  checkIn: string | null; // HH:mm
  checkOut: string | null; // HH:mm
  workingHours: number | null;
  overtimeHours: number | null;
  isOvertime: boolean;
  status: AttendanceStatus;
};

function computeOvertime(workingHours: number | null): { overtimeHours: number | null; isOvertime: boolean } {
  if (!EMPLOYEE_OVERTIME_ALLOWED || workingHours == null) return { overtimeHours: null, isOvertime: false };
  const extra = Math.round(Math.max(0, workingHours - STANDARD_SHIFT_HOURS) * 100) / 100;
  return { overtimeHours: extra > 0 ? extra : null, isOvertime: extra > 0 };
}

function generateAttendanceHistory(): AttendanceRecord[] {
  const records: AttendanceRecord[] = [];
  const now = new Date();
  for (let i = 1; i <= 21; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const day = d.getDay();
    if (day === 0 || day === 6) continue; // skip weekends

    const roll = Math.random();
    const dateStr = d.toISOString().slice(0, 10);
    if (roll < 0.08) {
      records.push({
        attendanceId: `att-${dateStr}`,
        employeeId: "EMP-1042",
        shiftId: EMPLOYEE_SHIFT.shiftId,
        shiftName: EMPLOYEE_SHIFT.shiftName,
        attendanceDate: dateStr,
        checkIn: null,
        checkOut: null,
        workingHours: null,
        overtimeHours: null,
        isOvertime: false,
        status: "Absent",
      });
    } else {
      const late = roll < 0.2;
      const checkInHour = late ? 10 : 9;
      const checkInMin = late ? 15 : Math.floor(Math.random() * 20);
      // Occasionally run past the shift end time to exercise overtime.
      const ranLate = roll > 0.75;
      const workingHours = 8 + (Math.random() > 0.5 ? 0.5 : 0) + (ranLate ? 1.5 : 0);
      const checkOutHour = checkInHour + Math.floor(workingHours);
      const { overtimeHours, isOvertime } = computeOvertime(workingHours);
      records.push({
        attendanceId: `att-${dateStr}`,
        employeeId: "EMP-1042",
        shiftId: EMPLOYEE_SHIFT.shiftId,
        shiftName: EMPLOYEE_SHIFT.shiftName,
        attendanceDate: dateStr,
        checkIn: `${pad(checkInHour)}:${pad(checkInMin)}`,
        checkOut: `${pad(checkOutHour)}:${pad(checkInMin)}`,
        workingHours,
        overtimeHours,
        isOvertime,
        status: late ? "Late" : "Present",
      });
    }
  }
  return records.sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));
}

const attendanceHistory: AttendanceRecord[] = generateAttendanceHistory();

function timeNow() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const mockAttendanceApi = {
  async getToday(): Promise<AttendanceRecord | null> {
    await delay(300);
    return attendanceHistory.find((r) => r.attendanceDate === todayIso()) ?? null;
  },

  async checkIn(): Promise<AttendanceRecord> {
    await delay(400);
    const existing = attendanceHistory.find((r) => r.attendanceDate === todayIso());
    if (existing && existing.checkIn) {
      throw new Error("You've already checked in today.");
    }
    const now = new Date();
    const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15);
    const record: AttendanceRecord = existing ?? {
      attendanceId: `att-${todayIso()}`,
      employeeId: "EMP-1042",
      shiftId: EMPLOYEE_SHIFT.shiftId,
      shiftName: EMPLOYEE_SHIFT.shiftName,
      attendanceDate: todayIso(),
      checkIn: null,
      checkOut: null,
      workingHours: null,
      overtimeHours: null,
      isOvertime: false,
      status: "Present",
    };
    record.checkIn = timeNow();
    record.status = isLate ? "Late" : "Present";
    if (!existing) attendanceHistory.unshift(record);
    return { ...record };
  },

  async checkOut(): Promise<AttendanceRecord> {
    await delay(400);
    const record = attendanceHistory.find((r) => r.attendanceDate === todayIso());
    if (!record || !record.checkIn) {
      throw new Error("You need to check in before checking out.");
    }
    if (record.checkOut) {
      throw new Error("You've already checked out today.");
    }
    record.checkOut = timeNow();
    const [inH, inM] = record.checkIn.split(":").map(Number);
    const [outH, outM] = record.checkOut.split(":").map(Number);
    record.workingHours = Math.max(0, Math.round(((outH * 60 + outM - (inH * 60 + inM)) / 60) * 100) / 100);
    const { overtimeHours, isOvertime } = computeOvertime(record.workingHours);
    record.overtimeHours = overtimeHours;
    record.isOvertime = isOvertime;
    return { ...record };
  },

  async getHistory(params: { month: number; year: number }): Promise<AttendanceRecord[]> {
    await delay(400);
    return attendanceHistory.filter((r) => {
      const d = new Date(r.attendanceDate);
      return d.getMonth() + 1 === params.month && d.getFullYear() === params.year;
    });
  },
};

// ---------------------------------------------------------------------------
// Leave  (maps to `LeaveType` and `Leave` tables)
// ---------------------------------------------------------------------------
export type LeaveType = {
  leaveTypeId: string;
  leaveTypeName: string;
  isPaid: boolean;
  isActive: boolean;
  allocatedDays: number;
};

export const leaveTypes: LeaveType[] = [
  { leaveTypeId: "LT-1", leaveTypeName: "Annual Leave", isPaid: true, isActive: true, allocatedDays: 18 },
  { leaveTypeId: "LT-2", leaveTypeName: "Sick Leave", isPaid: true, isActive: true, allocatedDays: 10 },
  { leaveTypeId: "LT-3", leaveTypeName: "Casual Leave", isPaid: true, isActive: true, allocatedDays: 8 },
  { leaveTypeId: "LT-4", leaveTypeName: "Unpaid Leave", isPaid: false, isActive: true, allocatedDays: 0 },
];

export type LeaveStatus = "Pending" | "Approved" | "Rejected";

export type LeaveRequest = {
  leaveId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  approvedOn: string | null;
  approvedBy: string | null;
  remarks: string | null;
};

const leaveRequests: LeaveRequest[] = [
  {
    leaveId: "LV-1001",
    employeeId: "EMP-1042",
    leaveTypeId: "LT-1",
    leaveTypeName: "Annual Leave",
    startDate: "2026-06-10",
    endDate: "2026-06-12",
    totalDays: 3,
    reason: "Family trip",
    status: "Approved",
    appliedOn: "2026-06-01T09:12:00Z",
    approvedOn: "2026-06-02T14:00:00Z",
    approvedBy: "HR Manager",
    remarks: "Approved — enjoy!",
  },
  {
    leaveId: "LV-1002",
    employeeId: "EMP-1042",
    leaveTypeId: "LT-2",
    leaveTypeName: "Sick Leave",
    startDate: "2026-07-03",
    endDate: "2026-07-03",
    totalDays: 1,
    reason: "Fever",
    status: "Approved",
    appliedOn: "2026-07-03T08:05:00Z",
    approvedOn: "2026-07-03T10:00:00Z",
    approvedBy: "HR Manager",
    remarks: null,
  },
  {
    leaveId: "LV-1003",
    employeeId: "EMP-1042",
    leaveTypeId: "LT-3",
    leaveTypeName: "Casual Leave",
    startDate: "2026-07-28",
    endDate: "2026-07-29",
    totalDays: 2,
    reason: "Personal errand",
    status: "Pending",
    appliedOn: "2026-07-20T11:30:00Z",
    approvedOn: null,
    approvedBy: null,
    remarks: null,
  },
];

function daysBetweenInclusive(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export const mockLeaveApi = {
  async getLeaveTypes(): Promise<LeaveType[]> {
    await delay(250);
    return leaveTypes;
  },

  async getBalance(): Promise<
    { leaveTypeId: string; leaveTypeName: string; allocated: number; used: number; pending: number; remaining: number }[]
  > {
    await delay(350);
    return leaveTypes.map((lt) => {
      const used = leaveRequests
        .filter((l) => l.leaveTypeId === lt.leaveTypeId && l.status === "Approved")
        .reduce((sum, l) => sum + l.totalDays, 0);
      const pending = leaveRequests
        .filter((l) => l.leaveTypeId === lt.leaveTypeId && l.status === "Pending")
        .reduce((sum, l) => sum + l.totalDays, 0);
      return {
        leaveTypeId: lt.leaveTypeId,
        leaveTypeName: lt.leaveTypeName,
        allocated: lt.allocatedDays,
        used,
        pending,
        remaining: Math.max(0, lt.allocatedDays - used - pending),
      };
    });
  },

  async getMyLeaves(): Promise<LeaveRequest[]> {
    await delay(400);
    return [...leaveRequests].sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));
  },

  async applyLeave(payload: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
  }): Promise<LeaveRequest> {
    await delay(500);
    const leaveType = leaveTypes.find((lt) => lt.leaveTypeId === payload.leaveTypeId);
    if (!leaveType) throw new Error("Invalid leave type selected.");
    if (new Date(payload.endDate) < new Date(payload.startDate)) {
      throw new Error("End date can't be before the start date.");
    }
    const totalDays = daysBetweenInclusive(payload.startDate, payload.endDate);

    const used = leaveRequests
      .filter((l) => l.leaveTypeId === payload.leaveTypeId && l.status !== "Rejected")
      .reduce((sum, l) => sum + l.totalDays, 0);
    if (leaveType.isPaid && used + totalDays > leaveType.allocatedDays) {
      throw new Error(
        `Insufficient ${leaveType.leaveTypeName} balance. You have ${Math.max(0, leaveType.allocatedDays - used)} day(s) left.`,
      );
    }

    const record: LeaveRequest = {
      leaveId: `LV-${1000 + leaveRequests.length + 1}`,
      employeeId: "EMP-1042",
      leaveTypeId: leaveType.leaveTypeId,
      leaveTypeName: leaveType.leaveTypeName,
      startDate: payload.startDate,
      endDate: payload.endDate,
      totalDays,
      reason: payload.reason,
      status: "Pending",
      appliedOn: new Date().toISOString(),
      approvedOn: null,
      approvedBy: null,
      remarks: null,
    };
    leaveRequests.unshift(record);
    return record;
  },
};

// ---------------------------------------------------------------------------
// Payroll  (maps to `Payroll` and `PayComponents` tables)
// ---------------------------------------------------------------------------
export type PayComponent = {
  payComponentId: string;
  payrollId: string;
  componentName: string;
  componentType: "Earning" | "Deduction";
  amount: number;
};

export type PayrollRecord = {
  payrollId: string;
  employeeId: string;
  payrollMonth: number;
  payrollYear: number;
  basicSalary: number;
  allowance: number;
  bonus: number;
  deduction: number;
  tax: number;
  netSalary: number;
  paymentDate: string | null;
  generatedDate: string;
  status: "Generated" | "Pending";
  components: PayComponent[];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function buildPayroll(monthsAgo: number): PayrollRecord {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const basicSalary = 120000;
  const allowance = 15000;
  const bonus = monthsAgo === 0 ? 10000 : 0;
  const deduction = 3000;
  const tax = 9500;
  const netSalary = basicSalary + allowance + bonus - deduction - tax;
  const payrollId = `PR-${d.getFullYear()}${pad(d.getMonth() + 1)}`;
  return {
    payrollId,
    employeeId: "EMP-1042",
    payrollMonth: d.getMonth() + 1,
    payrollYear: d.getFullYear(),
    basicSalary,
    allowance,
    bonus,
    deduction,
    tax,
    netSalary,
    paymentDate: monthsAgo === 0 ? null : new Date(d.getFullYear(), d.getMonth(), 28).toISOString().slice(0, 10),
    generatedDate: new Date(d.getFullYear(), d.getMonth(), 27).toISOString().slice(0, 10),
    status: monthsAgo === 0 ? "Pending" : "Generated",
    components: [
      { payComponentId: `${payrollId}-C1`, payrollId, componentName: "Basic Salary", componentType: "Earning", amount: basicSalary },
      { payComponentId: `${payrollId}-C2`, payrollId, componentName: "House Allowance", componentType: "Earning", amount: allowance },
      ...(bonus > 0
        ? [{ payComponentId: `${payrollId}-C3`, payrollId, componentName: "Performance Bonus", componentType: "Earning" as const, amount: bonus }]
        : []),
      { payComponentId: `${payrollId}-C4`, payrollId, componentName: "Provident Fund", componentType: "Deduction", amount: deduction },
      { payComponentId: `${payrollId}-C5`, payrollId, componentName: "Income Tax", componentType: "Deduction", amount: tax },
    ],
  };
}

const payrollRecords: PayrollRecord[] = Array.from({ length: 6 }, (_, i) => buildPayroll(i));

export const mockPayrollApi = {
  async getMyPayroll(): Promise<PayrollRecord[]> {
    await delay(450);
    return payrollRecords;
  },

  async getPayslip(payrollId: string): Promise<PayrollRecord> {
    await delay(300);
    const record = payrollRecords.find((p) => p.payrollId === payrollId);
    if (!record) throw new Error("Payslip not found.");
    return record;
  },
};

export function monthLabel(month: number, year: number) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

// ---------------------------------------------------------------------------
// Appraisal  (maps to `Appraisal` and `AppraisalScore` tables)
// ---------------------------------------------------------------------------
export type AppraisalScoreItem = {
  scoreId: string;
  appraisalId: string;
  criteriaName: string;
  weightage: number;
  score: number; // out of 10
  remarks: string | null;
};

export type AppraisalRecord = {
  appraisalId: string;
  employeeId: string;
  reviewDate: string;
  reviewPeriod: string;
  totalScore: number;
  comments: string;
  recommendation: string;
  status: "Completed" | "Pending";
  scores: AppraisalScoreItem[];
};

const appraisalRecords: AppraisalRecord[] = [
  {
    appraisalId: "AP-2026-H1",
    employeeId: "EMP-1042",
    reviewDate: "2026-06-30",
    reviewPeriod: "Jan – Jun 2026",
    totalScore: 8.4,
    comments:
      "Consistently delivers high-quality work and collaborates well across teams. Shows strong ownership of assigned modules.",
    recommendation: "Recommended for a performance increment.",
    status: "Completed",
    scores: [
      { scoreId: "AS-1", appraisalId: "AP-2026-H1", criteriaName: "Job Knowledge", weightage: 25, score: 8.5, remarks: "Strong technical grasp." },
      { scoreId: "AS-2", appraisalId: "AP-2026-H1", criteriaName: "Quality of Work", weightage: 25, score: 8.8, remarks: null },
      { scoreId: "AS-3", appraisalId: "AP-2026-H1", criteriaName: "Communication", weightage: 20, score: 8.0, remarks: "Could be more proactive in updates." },
      { scoreId: "AS-4", appraisalId: "AP-2026-H1", criteriaName: "Teamwork", weightage: 15, score: 8.5, remarks: null },
      { scoreId: "AS-5", appraisalId: "AP-2026-H1", criteriaName: "Punctuality", weightage: 15, score: 7.8, remarks: null },
    ],
  },
  {
    appraisalId: "AP-2025-H2",
    employeeId: "EMP-1042",
    reviewDate: "2025-12-28",
    reviewPeriod: "Jul – Dec 2025",
    totalScore: 7.9,
    comments: "Solid, steady performance throughout the period.",
    recommendation: "No change to compensation this cycle.",
    status: "Completed",
    scores: [
      { scoreId: "AS-6", appraisalId: "AP-2025-H2", criteriaName: "Job Knowledge", weightage: 25, score: 8.0, remarks: null },
      { scoreId: "AS-7", appraisalId: "AP-2025-H2", criteriaName: "Quality of Work", weightage: 25, score: 7.8, remarks: null },
      { scoreId: "AS-8", appraisalId: "AP-2025-H2", criteriaName: "Communication", weightage: 20, score: 7.5, remarks: null },
      { scoreId: "AS-9", appraisalId: "AP-2025-H2", criteriaName: "Teamwork", weightage: 15, score: 8.2, remarks: null },
      { scoreId: "AS-10", appraisalId: "AP-2025-H2", criteriaName: "Punctuality", weightage: 15, score: 7.6, remarks: null },
    ],
  },
];

export const mockAppraisalApi = {
  async getMyAppraisals(): Promise<AppraisalRecord[]> {
    await delay(400);
    return appraisalRecords;
  },

  async getAppraisalDetail(appraisalId: string): Promise<AppraisalRecord> {
    await delay(250);
    const record = appraisalRecords.find((a) => a.appraisalId === appraisalId);
    if (!record) throw new Error("Appraisal results not available yet.");
    return record;
  },
};

// ---------------------------------------------------------------------------
// Notifications  (maps to `Notification` table)
// ---------------------------------------------------------------------------
export type NotificationType = "Leave" | "Payroll" | "Attendance" | "Appraisal" | "Announcement" | "General";

// The live `Notification` table has no per-employee recipient or `isRead`
// column — every notification created by an Admin/HR user is a broadcast
// visible to everyone (see hrApi.ts for the confirmed GET/POST shape).
// `isRead` therefore isn't part of the wire record at all; it's tracked
// client-side (see NotificationsContext.tsx) and only stitched onto this
// type for backward compatibility with screens that already key off it.
export type NotificationRecord = {
  notificationId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  createdById?: string;
  createdByName?: string;
};

type NotificationDraft = { title: string; message: string; type: NotificationType };

const notifications: NotificationRecord[] = [
  {
    notificationId: "NT-1",
    title: "Leave request approved",
    message: "Your Annual Leave request (Jun 10 – Jun 12) has been approved by HR.",
    type: "Leave",
    isRead: false,
    createdAt: "2026-07-21T09:30:00Z",
    createdById: "EMP-1001",
    createdByName: "Farah Nadeem",
  },
  {
    notificationId: "NT-2",
    title: "Payslip generated",
    message: "Your payslip for June 2026 is now available in the Payroll section.",
    type: "Payroll",
    isRead: false,
    createdAt: "2026-07-20T15:05:00Z",
    createdById: "EMP-1001",
    createdByName: "Farah Nadeem",
  },
  {
    notificationId: "NT-3",
    title: "Company holiday reminder",
    message: "Independence Day is observed on August 14 — the office will be closed.",
    type: "Announcement",
    isRead: false,
    createdAt: "2026-07-19T11:00:00Z",
    createdById: "EMP-1002",
    createdByName: "Ahsan Raza",
  },
  {
    notificationId: "NT-4",
    title: "Appraisal results published",
    message: "Your performance appraisal for Jan – Jun 2026 has been published.",
    type: "Appraisal",
    isRead: true,
    createdAt: "2026-06-30T17:45:00Z",
    createdById: "EMP-1002",
    createdByName: "Ahsan Raza",
  },
  {
    notificationId: "NT-5",
    title: "Missed check-out",
    message: "You didn't check out on July 15. Please contact HR if this needs correcting.",
    type: "Attendance",
    isRead: true,
    createdAt: "2026-07-15T20:00:00Z",
    createdById: "EMP-1001",
    createdByName: "Farah Nadeem",
  },
];

function newNotificationId() {
  return `NT-${Math.random().toString(36).slice(2, 9)}`;
}

export const mockNotificationApi = {
  async getAll(): Promise<NotificationRecord[]> {
    await delay(350);
    return [...notifications].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  async create(payload: NotificationDraft & { createdById?: string; createdByName?: string }): Promise<NotificationRecord> {
    await delay(300);
    const record: NotificationRecord = {
      notificationId: newNotificationId(),
      title: payload.title,
      message: payload.message,
      type: payload.type,
      isRead: false,
      createdAt: new Date().toISOString(),
      createdById: payload.createdById,
      createdByName: payload.createdByName,
    };
    notifications.unshift(record);
    return { ...record };
  },

  async update(notificationId: string, payload: NotificationDraft): Promise<NotificationRecord> {
    await delay(250);
    const record = notifications.find((n) => n.notificationId === notificationId);
    if (!record) throw new Error("Notification not found.");
    record.title = payload.title;
    record.message = payload.message;
    record.type = payload.type;
    return { ...record };
  },

  async remove(notificationId: string): Promise<{ notificationId: string }> {
    await delay(200);
    const idx = notifications.findIndex((n) => n.notificationId === notificationId);
    if (idx === -1) throw new Error("Notification not found.");
    notifications.splice(idx, 1);
    return { notificationId };
  },
};
