// Hardcoded demo data + a tiny in-memory "database" for the HR/Administrator
// operational modules: org-wide Attendance correction and Leave approval.
//
// Seeded lazily from the Employee Management store (employeeMockData.ts) so
// every record here refers to a real, editable employee — same convention as
// employeeMockData.ts seeding from settingsMockData.ts.

import { mockEmployeesApi, type Employee } from "@/modules/employees/mocks/employeeMockData";

const delay = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () =>
 typeof crypto !== "undefined" && "randomUUID" in crypto
 ? crypto.randomUUID()
 : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const pad = (n: number) => String(n).padStart(2, "0");

export type ListResult<T> = { data: T[]; total: number };

// ---- Attendance -------------------------------------------------------

// "Half-Day" / "On Leave" are the extra values the live backend actually
// sends on `attendance_status`, alongside the original demo-only set.
export type AdminAttendanceStatus = "Present" | "Late" | "Absent" | "Leave" | "Holiday" | "Half-Day" | "On Leave";

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
 checkInPunctuality: "early" | "on-time" | "late" | null;
 checkInVarianceMinutes: number | null;
 checkOutPunctuality: "early" | "on-time" | "late" | null;
 checkOutVarianceMinutes: number | null;
};

export type AttendanceListParams = {
 search?: string;
 departmentId?: string;
 employeeId?: string;
 status?: AdminAttendanceStatus | "";
 date?: string;
 month?: number;
 year?: number;
 page?: number;
 pageSize?: number;
};

export type AttendanceCorrection = { checkIn: string | null; checkOut: string | null; status: AdminAttendanceStatus };

// HR/Admin "mark attendance" payloads. Times are "HH:mm" (the mock's display
// precision); the API layer pads them to "HH:mm:ss" for the live backend.
export type MarkAttendancePayload = {
 attendanceDate: string; // YYYY-MM-DD
 status: AdminAttendanceStatus;
 checkIn?: string | null; // HH:mm
 checkOut?: string | null; // HH:mm
};

export type BulkMarkPayload = MarkAttendancePayload & {
 employeeIds?: string[];
 departmentId?: string;
 allActive?: boolean;
};

export type BulkMarkResult = {
 marked: number;
 skipped: number;
 total: number;
 results: Array<{
 employeeId: string;
 employeeCode: string;
 employeeName: string;
 ok: boolean;
 reason?: string;
 }>;
};

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
 /** "Full Day" | "First Half" | "Second Half" | "Multiple Days". */
 durationType: string;
 reason: string;
 status: AdminLeaveStatus;
 appliedOn: string;
};

export type LeaveListParams = {
 search?: string;
 departmentId?: string;
 employeeId?: string;
 status?: AdminLeaveStatus | "";
 page?: number;
 pageSize?: number;
};

let leaveRequests: AdminLeaveRequest[] = [];

// ---- Payroll --------------------------------------------------------------

export type AdminPayrollRecord = {
 payrollId: string;
 employeeId: string;
 employeeName: string;
 employeeCode: string;
 departmentId: string;
 departmentName: string;
 payrollMonth: number; // 1-12
 payrollYear: number;
 basicSalary: number;
 allowance: number;
 bonus: number;
 deduction: number;
 tax: number;
 netSalary: number;
 paymentDate: string | null;
 status: "Generated" | "Pending";
};

export type PayrollListParams = {
 search?: string;
 departmentId?: string;
 employeeId?: string;
 month?: number;
 year?: number;
 page?: number;
 pageSize?: number;
};

export type GeneratePayrollInput = {
 month: number;
 year: number;
 basicSalary: number;
 allowance: number;
 bonus: number;
 deduction: number;
 tax: number;
 paymentDate?: string | null;
};

let payrollRecordsAdmin: AdminPayrollRecord[] = [];

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

// Demo shift the mock attendance is scored against — 09:00 start, 17:00 end,
// 5-minute grace either side. The real backend derives punctuality from each
// employee's assigned shift; here every seeded row uses this one so the
// Early/Late arrival & departure flags have something to compare against.
const MOCK_SHIFT = { start: "09:00", end: "17:00", grace: 5 };

const minutesOf = (t: string) => {
 const [h, m] = t.split(":").map(Number);
 return (h || 0) * 60 + (m || 0);
};

type PunctualityFields = Pick<
 AdminAttendanceRecord,
 "checkInPunctuality" | "checkInVarianceMinutes" | "checkOutPunctuality" | "checkOutVarianceMinutes"
>;

// Mirrors the backend's derivePunctuality (attendance-punctuality.ts): lateness
// uses the shift grace period, earliness a flat 5-minute tolerance.
function derivePunctuality(checkIn: string | null, checkOut: string | null): PunctualityFields {
 const out: PunctualityFields = {
 checkInPunctuality: null,
 checkInVarianceMinutes: null,
 checkOutPunctuality: null,
 checkOutVarianceMinutes: null,
 };
 if (checkIn) {
 const variance = minutesOf(checkIn) - minutesOf(MOCK_SHIFT.start);
 out.checkInVarianceMinutes = variance;
 out.checkInPunctuality = variance > MOCK_SHIFT.grace ? "late" : variance < -5 ? "early" : "on-time";
 }
 if (checkOut) {
 const variance = minutesOf(checkOut) - minutesOf(MOCK_SHIFT.end);
 out.checkOutVarianceMinutes = variance;
 out.checkOutPunctuality = variance < -5 ? "early" : variance > 5 ? "late" : "on-time";
 }
 return out;
}

// Statuses that carry no time stamps by definition — an Absent or On-Leave day
// has no arrival, so any check-in/out passed alongside them is dropped.
const NON_WORKING_STATUSES: AdminAttendanceStatus[] = ["Absent", "Leave", "On Leave", "Holiday"];

// Builds one attendance row from a mark/bulk-mark payload, computing working
// hours from the two stamps and dropping stamps for non-working statuses.
function buildMarkedRecord(emp: Employee, payload: MarkAttendancePayload): AdminAttendanceRecord {
 const nonWorking = NON_WORKING_STATUSES.includes(payload.status);
 const checkIn = nonWorking ? null : payload.checkIn || null;
 const checkOut = nonWorking ? null : payload.checkOut || null;

 let workingHours: number | null = null;
 if (checkIn && checkOut) {
 const mins = minutesOf(checkOut) - minutesOf(checkIn);
 workingHours = Math.max(0, Math.round((mins / 60) * 100) / 100);
 }

 return {
 attendanceId: uuid(),
 employeeId: emp.employeeId,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 employeeCode: emp.employeeCode,
 departmentId: emp.departmentId,
 departmentName: emp.departmentName,
 shiftName: emp.shiftName,
 attendanceDate: payload.attendanceDate,
 checkIn,
 checkOut,
 workingHours,
 status: payload.status,
 ...derivePunctuality(checkIn, checkOut),
 };
}
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
 ...derivePunctuality(checkIn, checkOut),
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
 durationType: totalDays > 1 ? "Multiple Days" : "Full Day",
 reason: LEAVE_REASONS[(index + j * 3) % LEAVE_REASONS.length],
 status,
 appliedOn: toIso(addDays(start, -3)),
 });
 }
 return rows;
}

function buildPayrollForEmployee(emp: Employee): AdminPayrollRecord[] {
 const rows: AdminPayrollRecord[] = [];
 const now = new Date();
 const basicSalary = emp.salary ?? 50000;
 const allowance = Math.round(basicSalary * 0.1 * 100) / 100;
 const deduction = Math.round(basicSalary * 0.02 * 100) / 100;
 const tax = Math.round(basicSalary * 0.08 * 100) / 100;

 for (let i = 3; i >= 0; i--) {
 const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
 const isCurrent = i === 0;
 const bonus = !isCurrent && Math.random() > 0.5 ? Math.round(basicSalary * 0.05 * 100) / 100 : 0;
 const netSalary = basicSalary + allowance + bonus - deduction - tax;

 rows.push({
 payrollId: uuid(),
 employeeId: emp.employeeId,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 employeeCode: emp.employeeCode,
 departmentId: emp.departmentId,
 departmentName: emp.departmentName,
 payrollMonth: d.getMonth() + 1,
 payrollYear: d.getFullYear(),
 basicSalary,
 allowance,
 bonus,
 deduction,
 tax,
 netSalary,
 paymentDate: isCurrent ? null : toIso(new Date(d.getFullYear(), d.getMonth(), 6)),
 status: isCurrent ? "Pending" : "Generated",
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
 payrollRecordsAdmin = activeEmployees.flatMap(buildPayrollForEmployee);
 seeded = true;
 })();

 return seeding;
}

function paginate<T>(rows: T[], params: { page?: number; pageSize?: number }): ListResult<T> {
 // An explicit pageSize of 0 means "all rows" (used by CSV export to pull the
 // full filtered set); only an absent/negative value falls back to 10.
 if (params.pageSize === 0) return { data: rows, total: rows.length };
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
 if (params.employeeId) filtered = filtered.filter((r) => r.employeeId === params.employeeId);
 if (params.status) filtered = filtered.filter((r) => r.status === params.status);
 if (params.date) filtered = filtered.filter((r) => r.attendanceDate === params.date);
 if (params.month) filtered = filtered.filter((r) => new Date(r.attendanceDate).getMonth() + 1 === params.month);
 if (params.year) filtered = filtered.filter((r) => new Date(r.attendanceDate).getFullYear() === params.year);
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

 // HR/Admin marking check-in/check-out on behalf of a single employee
 // (e.g. front-desk attendance for staff without self-service access).
 async getToday(employeeId: string): Promise<AdminAttendanceRecord | null> {
 await ensureSeeded();
 await delay(150);
 const today = toIso(new Date());
 return attendanceRecords.find((r) => r.employeeId === employeeId && r.attendanceDate === today) ?? null;
 },

 async checkInEmployee(employeeId: string): Promise<AdminAttendanceRecord> {
 await ensureSeeded();
 await delay(250);
 const today = toIso(new Date());
 const existing = attendanceRecords.find((r) => r.employeeId === employeeId && r.attendanceDate === today);
 if (existing?.checkIn) return existing;

 const emp = (await mockEmployeesApi.getById(employeeId)) as Employee;
 const now = new Date();
 const checkIn = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
 const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15);

 if (existing) {
 existing.checkIn = checkIn;
 existing.status = isLate ? "Late" : "Present";
 Object.assign(existing, derivePunctuality(existing.checkIn, existing.checkOut));
 return existing;
 }

 const record: AdminAttendanceRecord = {
 attendanceId: uuid(),
 employeeId: emp.employeeId,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 employeeCode: emp.employeeCode,
 departmentId: emp.departmentId,
 departmentName: emp.departmentName,
 shiftName: emp.shiftName,
 attendanceDate: today,
 checkIn,
 checkOut: null,
 workingHours: null,
 status: isLate ? "Late" : "Present",
 ...derivePunctuality(checkIn, null),
 };
 attendanceRecords = [record, ...attendanceRecords];
 return record;
 },

 async checkOutEmployee(employeeId: string): Promise<AdminAttendanceRecord> {
 await ensureSeeded();
 await delay(250);
 const today = toIso(new Date());
 const existing = attendanceRecords.find((r) => r.employeeId === employeeId && r.attendanceDate === today);
 if (!existing || !existing.checkIn) throw new Error("No check-in found for today.");
 if (existing.checkOut) return existing;

 const now = new Date();
 existing.checkOut = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
 const [inH, inM] = existing.checkIn.split(":").map(Number);
 const [outH, outM] = existing.checkOut.split(":").map(Number);
 const hours = Math.max(0, Math.round(((outH * 60 + outM - (inH * 60 + inM)) / 60) * 100) / 100);
 existing.workingHours = hours;
 Object.assign(existing, derivePunctuality(existing.checkIn, existing.checkOut));
 return existing;
 },

 // HR/Admin marks a single employee for a given day (mirrors POST /attendance
 // with an explicit user_id). Upserts on (employeeId, attendanceDate).
 async markFor(employeeId: string, payload: MarkAttendancePayload): Promise<AdminAttendanceRecord> {
 await ensureSeeded();
 await delay(300);
 const emp = (await mockEmployeesApi.getById(employeeId)) as Employee;
 const record = buildMarkedRecord(emp, payload);
 attendanceRecords = [
 record,
 ...attendanceRecords.filter(
 (r) => !(r.employeeId === employeeId && r.attendanceDate === payload.attendanceDate),
 ),
 ];
 return record;
 },

 // Bulk-mark: a set of employees, a whole department, or every active
 // employee, for one day (mirrors POST /attendance/bulk-mark). Skips anyone
 // already marked that day, matching the backend's idempotent behaviour.
 async bulkMark(payload: BulkMarkPayload): Promise<BulkMarkResult> {
 await ensureSeeded();
 await delay(500);
 const res = await mockEmployeesApi.list({ pageSize: 100 });
 let targets = res.data.filter((e) => e.status === "active");
 if (!payload.allActive) {
 if (payload.departmentId) targets = targets.filter((e) => e.departmentId === payload.departmentId);
 if (payload.employeeIds?.length) {
 const set = new Set(payload.employeeIds);
 targets = targets.filter((e) => set.has(e.employeeId));
 }
 }

 const results: BulkMarkResult["results"] = [];
 let marked = 0;
 let skipped = 0;
 for (const emp of targets) {
 const already = attendanceRecords.find(
 (r) => r.employeeId === emp.employeeId && r.attendanceDate === payload.attendanceDate,
 );
 if (already) {
 skipped++;
 results.push({
 employeeId: emp.employeeId,
 employeeCode: emp.employeeCode,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 ok: false,
 reason: "Already marked for this date",
 });
 continue;
 }
 const record = buildMarkedRecord(emp, payload);
 attendanceRecords = [record, ...attendanceRecords];
 marked++;
 results.push({
 employeeId: emp.employeeId,
 employeeCode: emp.employeeCode,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 ok: true,
 });
 }
 return { marked, skipped, total: targets.length, results };
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
 if (params.employeeId) filtered = filtered.filter((r) => r.employeeId === params.employeeId);
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

 async applyFor(
 employeeId: string,
 payload: { leaveTypeName: string; startDate: string; endDate: string; reason: string },
 ): Promise<AdminLeaveRequest> {
 await ensureSeeded();
 await delay(400);
 if (new Date(payload.endDate) < new Date(payload.startDate)) {
 throw new Error("End date can't be before the start date.");
 }
 const emp = (await mockEmployeesApi.getById(employeeId)) as Employee;
 const totalDays =
 Math.round((new Date(payload.endDate).getTime() - new Date(payload.startDate).getTime()) / 86400000) + 1;

 const record: AdminLeaveRequest = {
 leaveId: uuid(),
 employeeId: emp.employeeId,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 employeeCode: emp.employeeCode,
 departmentId: emp.departmentId,
 departmentName: emp.departmentName,
 leaveTypeName: payload.leaveTypeName,
 startDate: payload.startDate,
 endDate: payload.endDate,
 totalDays,
 durationType: totalDays > 1 ? "Multiple Days" : "Full Day",
 reason: payload.reason,
 status: "Pending",
 appliedOn: toIso(new Date()),
 };
 leaveRequests = [record, ...leaveRequests];
 return record;
 },
};

export const mockAdminPayrollApi = {
 async list(params: PayrollListParams = {}): Promise<ListResult<AdminPayrollRecord>> {
 await ensureSeeded();
 await delay();
 let filtered = payrollRecordsAdmin.filter((r) => matchesSearch([r.employeeName, r.employeeCode, r.departmentName], params.search));
 if (params.departmentId) filtered = filtered.filter((r) => r.departmentId === params.departmentId);
 if (params.employeeId) filtered = filtered.filter((r) => r.employeeId === params.employeeId);
 if (params.month) filtered = filtered.filter((r) => r.payrollMonth === params.month);
 if (params.year) filtered = filtered.filter((r) => r.payrollYear === params.year);
 filtered = [...filtered].sort((a, b) => (b.payrollYear !== a.payrollYear ? b.payrollYear - a.payrollYear : b.payrollMonth - a.payrollMonth));
 return paginate(filtered, params);
 },

 async generate(employeeId: string, input: GeneratePayrollInput): Promise<AdminPayrollRecord> {
 await ensureSeeded();
 await delay(400);
 const emp = (await mockEmployeesApi.getById(employeeId)) as Employee;
 const netSalary = input.basicSalary + input.allowance + input.bonus - input.deduction - input.tax;
 const record: AdminPayrollRecord = {
 payrollId: uuid(),
 employeeId: emp.employeeId,
 employeeName: `${emp.firstName} ${emp.lastName}`,
 employeeCode: emp.employeeCode,
 departmentId: emp.departmentId,
 departmentName: emp.departmentName,
 payrollMonth: input.month,
 payrollYear: input.year,
 basicSalary: input.basicSalary,
 allowance: input.allowance,
 bonus: input.bonus,
 deduction: input.deduction,
 tax: input.tax,
 netSalary,
 paymentDate: input.paymentDate ?? null,
 status: input.paymentDate ? "Generated" : "Pending",
 };
 payrollRecordsAdmin = [record, ...payrollRecordsAdmin];
 return record;
 },

 async remove(payrollId: string): Promise<{ payrollId: string }> {
 await ensureSeeded();
 await delay(250);
 payrollRecordsAdmin = payrollRecordsAdmin.filter((r) => r.payrollId !== payrollId);
 return { payrollId };
 },
};
