// Hardcoded demo data + a tiny in-memory "database" for the HR/Administrator
// operational modules: org-wide Attendance correction and Leave approval.
//
// Seeded lazily from the Employee Management store (employeeMockData.ts) so
// every record here refers to a real, editable employee — same convention as
// employeeMockData.ts seeding from settingsMockData.ts.

import { mockEmployeesApi, type Employee } from "./employeeMockData";

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pad = (n: number) => String(n).padStart(2, "0");

export type ListResult<T> = { data: T[]; total: number };

// ---- Attendance -------------------------------------------------------

export type AdminAttendanceStatus = "Present" | "Late" | "Absent" | "Leave" | "Holiday";

export type AdminAttendanceRecord = {
  attendanceId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string;
  departmentName: string;
  shiftName: string;
  attendanceDate: string; // YYYY-MM-DD
  checkIn: string | null; // HH:mm
  checkOut: string | null; // HH:mm
  workingHours: number | null;
  status: AdminAttendanceStatus;
};

export type AttendanceListParams = {
  search?: string;
  departmentId?: string;
  status?: AdminAttendanceStatus | "";
  date?: string;
  page?: number;
  pageSize?: number;
};

export type AttendanceCorrection = { checkIn: string | null; checkOut: string | null; status: AdminAttendanceStatus };

let attendanceRecords: AdminAttendanceRecord[] = [];

// ---- Leave --------------------------------------------------------------

export type AdminLeaveStatus = "Pending" | "Approved" | "Rejected";

export type AdminLeaveRequest = {
  leaveId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string;
  departmentName: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: AdminLeaveStatus;
  appliedOn: string;
};

export type LeaveListParams = {
  search?: string;
  departmentId?: string;
  status?: AdminLeaveStatus | "";
  page?: number;
  pageSize?: number;
};

let leaveRequests: AdminLeaveRequest[] = [];

const LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Casual Leave", "Unpaid Leave"];
const LEAVE_REASONS = [
  "Family emergency",
  "Medical appointment",
  "Personal matters",
  "Feeling unwell",
  "Travel / vacation",
  "Attending a family event",
];

let seeded = false;
let seeding: Promise<void> | null = null;

function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
const toIso = (d: Date) => d.toISOString().slice(0, 10);

function buildAttendanceForEmployee(emp: Employee): AdminAttendanceRecord[] {
  const rows: AdminAttendanceRecord[] = [];
  const now = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = addDays(now, -i);
    const day = d.getDay();
    if (day === 0 || day === 6) continue; // skip weekends

    const dateStr = toIso(d);
    const roll = Math.random();
    let status: AdminAttendanceStatus;
    let checkIn: string | null = null;
    let checkOut: string | null = null;
    let workingHours: number | null = null;

    if (roll < 0.08) {
      status = "Absent";
    } else if (roll < 0.16) {
      status = "Leave";
    } else {
      const late = roll < 0.32;
      status = late ? "Late" : "Present";
      const checkInHour = late ? 10 : 9;
      const checkInMin = late ? 10 + Math.floor(Math.random() * 20) : Math.floor(Math.random() * 15);
      workingHours = 8 + (Math.random() > 0.5 ? 0.5 : 0);
      const checkOutHour = checkInHour + Math.floor(workingHours);
      checkIn = `${pad(checkInHour)}:${pad(checkInMin)}`;
      checkOut = `${pad(checkOutHour)}:${pad(checkInMin)}`;
    }

    rows.push({
      attendanceId: uuid(),
      employeeId: emp.employeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      departmentId: emp.departmentId,
      departmentName: emp.departmentName,
      shiftName: emp.shiftName,
      attendanceDate: dateStr,
      checkIn,
      checkOut,
      workingHours,
      status,
    });
  }
  return rows;
}

function buildLeaveForEmployee(emp: Employee, index: number): AdminLeaveRequest[] {
  const rows: AdminLeaveRequest[] = [];
  const now = new Date();
  const count = 1 + (index % 2);
  for (let j = 0; j < count; j++) {
    const offset = -(index * 3 + j * 9 + 2);
    const start = addDays(now, offset);
    const totalDays = 1 + Math.floor(Math.random() * 3);
    const end = addDays(start, totalDays - 1);
    const statusRoll = Math.random();
    const status: AdminLeaveStatus = offset > -5 ? "Pending" : statusRoll < 0.6 ? "Approved" : statusRoll < 0.85 ? "Rejected" : "Pending";

    rows.push({
      leaveId: uuid(),
      employeeId: emp.employeeId,
      employeeName: `${emp.firstName} ${emp.lastName}`,
      employeeCode: emp.employeeCode,
      departmentId: emp.departmentId,
      departmentName: emp.departmentName,
      leaveTypeName: LEAVE_TYPES[(index + j) % LEAVE_TYPES.length],
      startDate: toIso(start),
      endDate: toIso(end),
      totalDays,
      reason: LEAVE_REASONS[(index + j * 3) % LEAVE_REASONS.length],
      status,
      appliedOn: toIso(addDays(start, -3)),
    });
  }
  return rows;
}

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  if (seeding) return seeding;

  seeding = (async () => {
    const res = await mockEmployeesApi.list({ pageSize: 100 });
    const activeEmployees = res.data.filter((e) => e.status === "active");

    attendanceRecords = activeEmployees.flatMap(buildAttendanceForEmployee);
    leaveRequests = activeEmployees.flatMap((e, i) => buildLeaveForEmployee(e, i));
    seeded = true;
  })();

  return seeding;
}

function paginate<T>(rows: T[], params: { page?: number; pageSize?: number }): ListResult<T> {
  const page = params.page && params.page > 0 ? params.page : 1;
  const pageSize = params.pageSize && params.pageSize > 0 ? params.pageSize : 10;
  const start = (page - 1) * pageSize;
  return { data: rows.slice(start, start + pageSize), total: rows.length };
}

function matchesSearch(haystack: string[], search?: string) {
  if (!search?.trim()) return true;
  const needle = search.trim().toLowerCase();
  return haystack.some((field) => field.toLowerCase().includes(needle));
}

export const mockAdminAttendanceApi = {
  async list(params: AttendanceListParams = {}): Promise<ListResult<AdminAttendanceRecord>> {
    await ensureSeeded();
    await delay();
    let filtered = attendanceRecords.filter((r) => matchesSearch([r.employeeName, r.employeeCode, r.departmentName], params.search));
    if (params.departmentId) filtered = filtered.filter((r) => r.departmentId === params.departmentId);
    if (params.status) filtered = filtered.filter((r) => r.status === params.status);
    if (params.date) filtered = filtered.filter((r) => r.attendanceDate === params.date);
    filtered = [...filtered].sort((a, b) => b.attendanceDate.localeCompare(a.attendanceDate));
    return paginate(filtered, params);
  },

  async correct(id: string, payload: AttendanceCorrection): Promise<AdminAttendanceRecord> {
    await ensureSeeded();
    await delay();
    attendanceRecords = attendanceRecords.map((r) => (r.attendanceId === id ? { ...r, ...payload } : r));
    const updated = attendanceRecords.find((r) => r.attendanceId === id);
    if (!updated) throw new Error("Attendance record not found");
    return updated;
  },
};

export const mockAdminLeaveApi = {
  async list(params: LeaveListParams = {}): Promise<ListResult<AdminLeaveRequest>> {
    await ensureSeeded();
    await delay();
    let filtered = leaveRequests.filter((r) =>
      matchesSearch([r.employeeName, r.employeeCode, r.departmentName, r.leaveTypeName], params.search),
    );
    if (params.departmentId) filtered = filtered.filter((r) => r.departmentId === params.departmentId);
    if (params.status) filtered = filtered.filter((r) => r.status === params.status);
    filtered = [...filtered].sort((a, b) => b.appliedOn.localeCompare(a.appliedOn));
    return paginate(filtered, params);
  },

  async setStatus(id: string, status: "Approved" | "Rejected"): Promise<AdminLeaveRequest> {
    await ensureSeeded();
    await delay(250);
    leaveRequests = leaveRequests.map((r) => (r.leaveId === id ? { ...r, status } : r));
    const updated = leaveRequests.find((r) => r.leaveId === id);
    if (!updated) throw new Error("Leave request not found");
    return updated;
  },
};
