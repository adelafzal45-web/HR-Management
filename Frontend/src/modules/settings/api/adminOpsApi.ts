// API module for the HR/Administrator operational workspace: org-wide
// Attendance correction, Leave approval, and Payroll generation.
//
// Talks to the real backend through the shared transport in lib/apiClient
// (JWT bearer, refresh cookie, single-flight 401 replay, request timeout).
// There is NO demo/mock fallback anywhere in this file: a failed request
// surfaces to the page as an `ApiError` carrying the server's status and
// message, and the screen renders its own error state. Falling back to
// invented rows would reproduce exactly the bug this work set out to fix — a
// screen quietly showing fabricated attendance/leave/payroll while the real
// request was 403ing.
//
// Live backend routes (verified against the controllers):
// GET /attendance org-wide list (findAll takes no query params)
// POST /attendance mark one employee (optional user_id)
// PATCH /attendance/:id correct a record (checkIn/checkOut/status)
// POST /attendance/bulk-mark mark a set / department / all-active for a day
// GET /leave-requests org-wide list (findAll takes no query params)
// POST /leave-requests file a request on behalf of an employee
// PATCH /leave-requests/:id update a request — used here to set status to
// "Approved" / "Rejected" (there is no dedicated
// /approve or /reject route, so both go through
// the generic update).
// POST /payroll generate a payslip for one employee/month
// GET /payroll org-wide list
// DELETE /payroll/:id remove a generated payslip
//
// GET /attendance, /leave-requests, and /payroll all ignore query params
// (their findAll() takes none) and nest the employee under `user` with no
// department, so every filter the *ListParams describe, plus pagination and
// the department join, is applied client-side after fetching the full list.

import { apiRequest, ENDPOINTS, normalizeListResult } from "@/lib/apiClient";
import { parseAttendanceRow, computeHours } from "@/modules/attendance/api/attendanceAdapter";
import { parseLeaveRow } from "@/modules/leave/api/leaveAdapter";
import { parsePayrollRow, buildPayrollPayload } from "@/modules/payroll/api/payrollAdapter";
import { employeesApi } from "@/modules/employees/api/employeeApi";

export type ListResult<T> = { data: T[]; total: number };

// ---- Attendance -------------------------------------------------------

// The union is a superset: "Leave"/"Holiday" are legacy labels kept so any
// older persisted row still type-checks, while the live backend's canonical
// set is the six in ATTENDANCE_STATUSES below ("Non-Working" is the backend's
// name for a non-scheduled day, replacing the old "Holiday"). Every selectable
// status dropdown uses ATTENDANCE_STATUSES so it can never offer a value the
// backend's `@IsIn` would reject.
export type AdminAttendanceStatus =
 | "Present"
 | "Late"
 | "Absent"
 | "Leave"
 | "Holiday"
 | "Half-Day"
 | "On Leave"
 | "Non-Working";

// Canonical statuses the live backend accepts (mirror of Backend
// attendance-status.ts `ATTENDANCE_STATUSES`). Drives every status dropdown so
// the filter, correction, and mark modals stay in lock-step with the API.
export const ATTENDANCE_STATUSES: AdminAttendanceStatus[] = [
 "Present",
 "Late",
 "Half-Day",
 "Absent",
 "On Leave",
 "Non-Working",
];

// How a record was captured (mirror of Backend attendance-source.ts). "Device"
// is a biometric/terminal punch; "Online" is manual/self-service marking and is
// the default when none is given.
export type AttendanceSource = "Device" | "Online";
export const ATTENDANCE_SOURCES: AttendanceSource[] = ["Device", "Online"];
export const DEFAULT_ATTENDANCE_SOURCE: AttendanceSource = "Online";

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
 /** Inclusive range bounds (YYYY-MM-DD); applied server-side and echoed client-side. */
 from?: string;
 to?: string;
 month?: number;
 year?: number;
 page?: number;
 pageSize?: number;
};

export type AttendanceCorrection = { checkIn: string | null; checkOut: string | null; status: AdminAttendanceStatus };

// HR/Admin "mark attendance" payloads. Times are "HH:mm" (the display
// precision); the API layer pads them to "HH:mm:ss" for the live backend.
export type MarkAttendancePayload = {
 attendanceDate: string; // YYYY-MM-DD
 status: AdminAttendanceStatus;
 checkIn?: string | null; // HH:mm
 checkOut?: string | null; // HH:mm
 /** Device (biometric/terminal) vs Online (manual/self-service). Defaults Online. */
 source?: AttendanceSource;
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

const attendanceQs = (params: AttendanceListParams) => {
 const search = new URLSearchParams();
 if (params.search) search.set("search", params.search);
 if (params.departmentId) search.set("departmentId", params.departmentId);
 if (params.employeeId) search.set("employeeId", params.employeeId);
 if (params.status) search.set("status", params.status);
 if (params.date) search.set("date", params.date);
 if (params.from) search.set("from", params.from);
 if (params.to) search.set("to", params.to);
 if (params.month) search.set("month", String(params.month));
 if (params.year) search.set("year", String(params.year));
 if (params.page) search.set("page", String(params.page));
 if (params.pageSize) search.set("pageSize", String(params.pageSize));
 const str = search.toString();
 return str ? `?${str}` : "";
};

const leaveQs = (params: LeaveListParams) => {
 const search = new URLSearchParams();
 if (params.search) search.set("search", params.search);
 if (params.departmentId) search.set("departmentId", params.departmentId);
 if (params.employeeId) search.set("employeeId", params.employeeId);
 if (params.status) search.set("status", params.status);
 if (params.page) search.set("page", String(params.page));
 if (params.pageSize) search.set("pageSize", String(params.pageSize));
 const str = search.toString();
 return str ? `?${str}` : "";
};

// The live `GET /payroll` route takes no query params either (findAll()
// ignores them, same as `/attendance` and `/leave-requests`), so search/
// department/month/year filtering and the department join all happen
// client-side after fetching the full list.
async function adaptAdminPayrollRows(raw: unknown): Promise<AdminPayrollRecord[]> {
 const rows = normalizeListResult<Record<string, unknown>>(raw).data.map(parsePayrollRow);

 const employeesById = new Map<string, { departmentId: string; departmentName: string }>();
 try {
 const { data: employees } = await employeesApi.list();
 for (const emp of employees) {
 employeesById.set(emp.employeeId, { departmentId: emp.departmentId, departmentName: emp.departmentName });
 }
 } catch {
 // Department lookup is best-effort — payroll still renders without it.
 }

 return rows.map((r) => {
 const dept = employeesById.get(r.employeeId);
 return {
 payrollId: r.payrollId,
 employeeId: r.employeeId,
 employeeName: r.employeeName,
 employeeCode: r.employeeCode,
 departmentId: dept?.departmentId ?? "",
 departmentName: dept?.departmentName ?? "—",
 payrollMonth: r.payrollMonth,
 payrollYear: r.payrollYear,
 basicSalary: r.basicSalary,
 allowance: r.allowance,
 bonus: r.bonus,
 deduction: r.deduction,
 tax: r.tax,
 netSalary: r.netSalary,
 paymentDate: r.paymentDate,
 status: r.status,
 };
 });
}

function applyPayrollFilters(rows: AdminPayrollRecord[], params: PayrollListParams): ListResult<AdminPayrollRecord> {
 let filtered = rows;
 if (params.search) {
 const q = params.search.toLowerCase();
 filtered = filtered.filter((r) => r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q));
 }
 if (params.departmentId) filtered = filtered.filter((r) => r.departmentId === params.departmentId);
 if (params.employeeId) filtered = filtered.filter((r) => r.employeeId === params.employeeId);
 if (params.month) filtered = filtered.filter((r) => r.payrollMonth === params.month);
 if (params.year) filtered = filtered.filter((r) => r.payrollYear === params.year);

 filtered = [...filtered].sort((a, b) => (b.payrollYear !== a.payrollYear ? b.payrollYear - a.payrollYear : b.payrollMonth - a.payrollMonth));

 const total = filtered.length;
 const page = params.page ?? 1;
 const pageSize = params.pageSize ?? total;
 const start = (page - 1) * pageSize;
 const data = pageSize ? filtered.slice(start, start + pageSize) : filtered;
 return { data, total };
}

// The live `GET /attendance` row nests the employee under `user` (no
// department on it at all) and the shift under `shift` — it also has no
// department/status/date/search/page query support (findAll() takes no
// params), so every filter AttendanceListParams describes, plus pagination,
// has to be applied client-side after fetching the full list. Department
// name/id come from a `/users` lookup, joined in by employee id.
async function adaptAdminAttendanceRows(raw: unknown): Promise<AdminAttendanceRecord[]> {
 const rows = normalizeListResult<Record<string, unknown>>(raw).data.map(parseAttendanceRow);

 const employeesById = new Map<string, { departmentId: string; departmentName: string }>();
 try {
 const { data: employees } = await employeesApi.list();
 for (const emp of employees) {
 employeesById.set(emp.employeeId, { departmentId: emp.departmentId, departmentName: emp.departmentName });
 }
 } catch {
 // Department lookup is best-effort — attendance still renders without it.
 }

 return rows.map((r) => {
 const dept = employeesById.get(r.employeeId);
 return {
 attendanceId: r.attendanceId,
 employeeId: r.employeeId,
 employeeName: r.employeeName,
 employeeCode: r.employeeCode,
 departmentId: dept?.departmentId ?? "",
 departmentName: dept?.departmentName ?? "—",
 shiftName: r.shiftName,
 attendanceDate: r.attendanceDate,
 checkIn: r.checkIn,
 checkOut: r.checkOut,
 workingHours: r.workingHours,
 status: r.status as AdminAttendanceRecord["status"],
 checkInPunctuality: r.checkInPunctuality,
 checkInVarianceMinutes: r.checkInVarianceMinutes,
 checkOutPunctuality: r.checkOutPunctuality,
 checkOutVarianceMinutes: r.checkOutVarianceMinutes,
 };
 });
}

function applyAttendanceFilters(rows: AdminAttendanceRecord[], params: AttendanceListParams): ListResult<AdminAttendanceRecord> {
 let filtered = rows;
 if (params.search) {
 const q = params.search.toLowerCase();
 filtered = filtered.filter((r) => r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q));
 }
 if (params.departmentId) filtered = filtered.filter((r) => r.departmentId === params.departmentId);
 if (params.employeeId) filtered = filtered.filter((r) => r.employeeId === params.employeeId);
 if (params.status) filtered = filtered.filter((r) => r.status === params.status);
 if (params.date) filtered = filtered.filter((r) => r.attendanceDate === params.date);
 if (params.from) filtered = filtered.filter((r) => r.attendanceDate >= params.from!);
 if (params.to) filtered = filtered.filter((r) => r.attendanceDate <= params.to!);
 if (params.month) filtered = filtered.filter((r) => new Date(r.attendanceDate).getMonth() + 1 === params.month);
 if (params.year) filtered = filtered.filter((r) => new Date(r.attendanceDate).getFullYear() === params.year);

 filtered = [...filtered].sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));

 const total = filtered.length;
 const page = params.page ?? 1;
 const pageSize = params.pageSize ?? total;
 const start = (page - 1) * pageSize;
 const data = pageSize ? filtered.slice(start, start + pageSize) : filtered;
 return { data, total };
}

// The live `GET /leave-requests` row nests the employee under `user` (no
// department on it at all) and has no `total_days`/department/status/page
// query support (findAll() takes no params) — same situation as attendance,
// so every filter LeaveListParams describes, plus pagination and the
// department join, happens client-side after fetching the full list.
async function adaptAdminLeaveRows(raw: unknown): Promise<AdminLeaveRequest[]> {
 const rows = normalizeListResult<Record<string, unknown>>(raw).data.map(parseLeaveRow);

 const employeesById = new Map<string, { departmentId: string; departmentName: string }>();
 try {
 const { data: employees } = await employeesApi.list();
 for (const emp of employees) {
 employeesById.set(emp.employeeId, { departmentId: emp.departmentId, departmentName: emp.departmentName });
 }
 } catch {
 // Department lookup is best-effort — leave requests still render without it.
 }

 return rows.map((r) => {
 const dept = employeesById.get(r.employeeId);
 return {
 leaveId: r.leaveId,
 employeeId: r.employeeId,
 employeeName: r.employeeName,
 employeeCode: r.employeeCode,
 departmentId: dept?.departmentId ?? "",
 departmentName: dept?.departmentName ?? "—",
 leaveTypeName: r.leaveTypeName,
 startDate: r.startDate,
 endDate: r.endDate,
 totalDays: r.totalDays,
 durationType: r.durationType,
 reason: r.reason,
 status: r.status as AdminLeaveRequest["status"],
 appliedOn: r.appliedOn,
 };
 });
}

function applyLeaveFilters(rows: AdminLeaveRequest[], params: LeaveListParams): ListResult<AdminLeaveRequest> {
 let filtered = rows;
 if (params.search) {
 const q = params.search.toLowerCase();
 filtered = filtered.filter(
 (r) => r.employeeName.toLowerCase().includes(q) || r.employeeCode.toLowerCase().includes(q) || r.leaveTypeName.toLowerCase().includes(q),
 );
 }
 if (params.departmentId) filtered = filtered.filter((r) => r.departmentId === params.departmentId);
 if (params.employeeId) filtered = filtered.filter((r) => r.employeeId === params.employeeId);
 if (params.status) filtered = filtered.filter((r) => r.status === params.status);

 filtered = [...filtered].sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));

 const total = filtered.length;
 const page = params.page ?? 1;
 const pageSize = params.pageSize ?? total;
 const start = (page - 1) * pageSize;
 const data = pageSize ? filtered.slice(start, start + pageSize) : filtered;
 return { data, total };
}

export const adminAttendanceApi = {
 list: async (params: AttendanceListParams = {}): Promise<ListResult<AdminAttendanceRecord>> => {
 const raw = await apiRequest<unknown>(`${ENDPOINTS.attendance.base}${attendanceQs(params)}`);
 const rows = await adaptAdminAttendanceRows(raw);
 return applyAttendanceFilters(rows, params);
 },

 correct: async (id: string, payload: AttendanceCorrection): Promise<AdminAttendanceRecord> => {
 const needsTimes = payload.checkIn && payload.checkOut;
 const hours = needsTimes ? computeHours(payload.checkIn as string, payload.checkOut as string) : null;
 const updated = await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.byId(id), {
 method: "PATCH",
 body: {
 check_in: payload.checkIn ? `${payload.checkIn}:00` : null,
 check_out: payload.checkOut ? `${payload.checkOut}:00` : null,
 attendance_status: payload.status,
 ...(hours
 ? { working_hours: hours.workingHours, overtime_hours: hours.overtimeHours, is_overtime: hours.isOvertime }
 : {}),
 },
 });
 const parsed = parseAttendanceRow(updated);
 return {
 attendanceId: parsed.attendanceId,
 employeeId: parsed.employeeId,
 employeeName: parsed.employeeName,
 employeeCode: parsed.employeeCode,
 departmentId: "",
 departmentName: "—",
 shiftName: parsed.shiftName,
 attendanceDate: parsed.attendanceDate,
 checkIn: parsed.checkIn,
 checkOut: parsed.checkOut,
 workingHours: parsed.workingHours,
 status: parsed.status as AdminAttendanceRecord["status"],
 checkInPunctuality: parsed.checkInPunctuality,
 checkInVarianceMinutes: parsed.checkInVarianceMinutes,
 checkOutPunctuality: parsed.checkOutPunctuality,
 checkOutVarianceMinutes: parsed.checkOutVarianceMinutes,
 };
 },

 // HR/Admin marking check-in/check-out on behalf of a single employee (e.g.
 // front-desk attendance). Mirrors the self-service checkIn/checkOut in
 // hrApi.ts but takes an explicit employeeId instead of the current session.
 getTodayFor: async (employeeId: string): Promise<AdminAttendanceRecord | null> => {
 const today = new Date().toISOString().slice(0, 10);
 const raw = await apiRequest<unknown>(ENDPOINTS.attendance.base);
 const rows = await adaptAdminAttendanceRows(raw);
 return rows.find((r) => r.employeeId === employeeId && r.attendanceDate === today) ?? null;
 },

 checkInEmployee: async (employeeId: string): Promise<AdminAttendanceRecord> => {
 const now = new Date();
 const hh = String(now.getHours()).padStart(2, "0");
 const mm = String(now.getMinutes()).padStart(2, "0");

 const raw = await apiRequest<unknown>(ENDPOINTS.attendance.base);
 const rows = await adaptAdminAttendanceRows(raw);
 const mine = rows.filter((r) => r.employeeId === employeeId).sort((a, b) => (a.attendanceDate < b.attendanceDate ? 1 : -1));

 const created = await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.base, {
 method: "POST",
 body: {
 user_id: employeeId,
 attendance_date: now.toISOString().slice(0, 10),
 check_in: `${hh}:${mm}:00`,
 attendance_status: now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15) ? "Late" : "Present",
 },
 });
 const parsed = parseAttendanceRow(created);
 return {
 attendanceId: parsed.attendanceId,
 employeeId: parsed.employeeId,
 employeeName: parsed.employeeName,
 employeeCode: parsed.employeeCode,
 departmentId: mine[0]?.departmentId ?? "",
 departmentName: mine[0]?.departmentName ?? "—",
 shiftName: parsed.shiftName,
 attendanceDate: parsed.attendanceDate,
 checkIn: parsed.checkIn,
 checkOut: parsed.checkOut,
 workingHours: parsed.workingHours,
 status: parsed.status as AdminAttendanceRecord["status"],
 checkInPunctuality: parsed.checkInPunctuality,
 checkInVarianceMinutes: parsed.checkInVarianceMinutes,
 checkOutPunctuality: parsed.checkOutPunctuality,
 checkOutVarianceMinutes: parsed.checkOutVarianceMinutes,
 };
 },

 checkOutEmployee: async (employeeId: string): Promise<AdminAttendanceRecord> => {
 const today = await adminAttendanceApi.getTodayFor(employeeId);
 if (!today || !today.checkIn) throw new Error("No check-in found for today.");
 const now = new Date();
 const hh = String(now.getHours()).padStart(2, "0");
 const mm = String(now.getMinutes()).padStart(2, "0");
 const checkOut = `${hh}:${mm}`;
 const { workingHours, overtimeHours, isOvertime } = computeHours(today.checkIn, checkOut);
 const updated = await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.byId(today.attendanceId), {
 method: "PATCH",
 body: {
 check_out: `${checkOut}:00`,
 working_hours: workingHours,
 overtime_hours: overtimeHours,
 is_overtime: isOvertime,
 },
 });
 const parsed = parseAttendanceRow(updated);
 return {
 ...today,
 checkOut: parsed.checkOut ?? checkOut,
 workingHours: parsed.workingHours ?? workingHours,
 status: (parsed.status as AdminAttendanceRecord["status"]) ?? today.status,
 };
 },

 // HR/Admin marks a single employee for a specific day with an explicit
 // status/times (POST /attendance honours the optional user_id on the
 // permission-guarded route). Working hours are computed when both stamps
 // are present, matching the correction path above.
 markFor: async (employeeId: string, payload: MarkAttendancePayload): Promise<AdminAttendanceRecord> => {
 const hasTimes = Boolean(payload.checkIn && payload.checkOut);
 const hours = hasTimes ? computeHours(payload.checkIn as string, payload.checkOut as string) : null;
 const created = await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.base, {
 method: "POST",
 body: {
 user_id: employeeId,
 attendance_date: payload.attendanceDate,
 attendance_status: payload.status,
 ...(payload.source ? { source: payload.source } : {}),
 ...(payload.checkIn ? { check_in: `${payload.checkIn}:00` } : {}),
 ...(payload.checkOut ? { check_out: `${payload.checkOut}:00` } : {}),
 ...(hours
 ? { working_hours: hours.workingHours, overtime_hours: hours.overtimeHours, is_overtime: hours.isOvertime }
 : {}),
 },
 });
 const parsed = parseAttendanceRow(created);
 return {
 attendanceId: parsed.attendanceId,
 employeeId: parsed.employeeId || employeeId,
 employeeName: parsed.employeeName,
 employeeCode: parsed.employeeCode,
 departmentId: "",
 departmentName: "—",
 shiftName: parsed.shiftName,
 attendanceDate: parsed.attendanceDate,
 checkIn: parsed.checkIn,
 checkOut: parsed.checkOut,
 workingHours: parsed.workingHours,
 status: parsed.status as AdminAttendanceRecord["status"],
 checkInPunctuality: parsed.checkInPunctuality,
 checkInVarianceMinutes: parsed.checkInVarianceMinutes,
 checkOutPunctuality: parsed.checkOutPunctuality,
 checkOutVarianceMinutes: parsed.checkOutVarianceMinutes,
 };
 },

 // HR/Admin bulk-marks a set of employees, a whole department, or every
 // active employee for one day (POST /attendance/bulk-mark). The server
 // skips anyone already marked that day and returns a per-employee report.
 bulkMark: async (payload: BulkMarkPayload): Promise<BulkMarkResult> => {
 const raw = await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.bulkMark, {
 method: "POST",
 body: {
 attendance_date: payload.attendanceDate,
 attendance_status: payload.status,
 ...(payload.source ? { source: payload.source } : {}),
 ...(payload.checkIn ? { check_in: `${payload.checkIn}:00` } : {}),
 ...(payload.checkOut ? { check_out: `${payload.checkOut}:00` } : {}),
 ...(payload.allActive ? { all_active: true } : {}),
 ...(payload.departmentId ? { department_id: payload.departmentId } : {}),
 ...(payload.employeeIds?.length ? { user_ids: payload.employeeIds } : {}),
 },
 });
 const results = Array.isArray(raw.results) ? (raw.results as Array<Record<string, unknown>>) : [];
 return {
 marked: Number(raw.marked ?? 0),
 skipped: Number(raw.skipped ?? 0),
 total: Number(raw.total ?? results.length),
 results: results.map((r) => ({
 employeeId: String(r.user_id ?? r.employeeId ?? ""),
 employeeCode: String(r.employee_code ?? r.employeeCode ?? "—"),
 employeeName: String(r.employee_name ?? r.employeeName ?? "—"),
 ok: r.ok === true,
 reason: r.reason ? String(r.reason) : undefined,
 })),
 };
 },
};

export const adminLeaveApi = {
 list: async (params: LeaveListParams = {}): Promise<ListResult<AdminLeaveRequest>> => {
 const raw = await apiRequest<unknown>(`${ENDPOINTS.leaveRequests.base}${leaveQs(params)}`);
 const rows = await adaptAdminLeaveRows(raw);
 return applyLeaveFilters(rows, params);
 },

 // The decision note is mandatory, not optional polish: the backend's
 // `assertDecisionReason` rejects a status change to Approved/Rejected/
 // Cancelled with a 400 when the matching *_reason field is missing or blank,
 // because that note is what the employee reads in the notification. Sending
 // only `{ status }` — as this did — made every approval fail.
 approve: async (id: string, reason: string): Promise<AdminLeaveRequest> => {
 const updated = await apiRequest<Record<string, unknown>>(ENDPOINTS.leaveRequests.byId(id), {
 method: "PATCH",
 body: { status: "Approved", approval_reason: reason },
 });
 const rows = await adaptAdminLeaveRows([updated]);
 return rows[0];
 },

 reject: async (id: string, reason: string): Promise<AdminLeaveRequest> => {
 const updated = await apiRequest<Record<string, unknown>>(ENDPOINTS.leaveRequests.byId(id), {
 method: "PATCH",
 body: { status: "Rejected", rejection_reason: reason },
 });
 const rows = await adaptAdminLeaveRows([updated]);
 return rows[0];
 },

 // HR/Admin filing a leave request on behalf of a single employee (e.g.
 // logging a verbal/phoned-in request). Same confirmed POST contract as
 // the self-service applyLeave in hrApi.ts: leave_type/start_date/
 // end_date/reason/status/user_id, all snake_case.
 applyFor: async (employeeId: string, payload: { leaveTypeName: string; startDate: string; endDate: string; reason: string }): Promise<AdminLeaveRequest> => {
 const created = await apiRequest<Record<string, unknown>>(ENDPOINTS.leaveRequests.base, {
 method: "POST",
 body: {
 user_id: employeeId,
 leave_type: payload.leaveTypeName,
 start_date: payload.startDate,
 end_date: payload.endDate,
 reason: payload.reason,
 status: "Pending",
 },
 });
 const rows = await adaptAdminLeaveRows([created]);
 return rows[0];
 },
};

export const adminPayrollApi = {
 list: async (params: PayrollListParams = {}): Promise<ListResult<AdminPayrollRecord>> => {
 const raw = await apiRequest<unknown>(ENDPOINTS.payroll.base);
 const rows = await adaptAdminPayrollRows(raw);
 return applyPayrollFilters(rows, params);
 },

 // HR/Admin generating a payslip for a single employee for a given month.
 // Confirmed POST contract (per the live Swagger doc): payroll_month
 // (first-of-month date string), basic_salary/allowance/bonus/deduction/
 // tax/net_salary as numbers, payment_date, user_id — all snake_case.
 generate: async (employeeId: string, input: GeneratePayrollInput): Promise<AdminPayrollRecord> => {
 const body = buildPayrollPayload({
 employeeId,
 month: input.month,
 year: input.year,
 basicSalary: input.basicSalary,
 allowance: input.allowance,
 bonus: input.bonus,
 deduction: input.deduction,
 tax: input.tax,
 paymentDate: input.paymentDate,
 });
 const created = await apiRequest<Record<string, unknown>>(ENDPOINTS.payroll.base, {
 method: "POST",
 body,
 });
 const rows = await adaptAdminPayrollRows([created]);
 return rows[0];
 },

 remove: async (payrollId: string): Promise<{ payrollId: string }> => {
 await apiRequest<unknown>(ENDPOINTS.payroll.byId(payrollId), { method: "DELETE" });
 return { payrollId };
 },
};
