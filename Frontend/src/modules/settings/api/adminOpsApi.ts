// API module for the HR/Administrator operational workspace: org-wide
// Attendance correction, Leave approval, and Payroll generation.
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
//   POST   /payroll            generate a payslip for one employee/month
//   GET    /payroll            org-wide list (search, department, month, year, page)
//   DELETE /payroll/:id        remove a generated payslip

import { apiRequest, withDemoFallback, normalizeListResult } from "@/api/client";
import { parseAttendanceRow, computeHours } from "@/modules/attendance/api/attendanceAdapter";
import { parseLeaveRow } from "@/modules/leave/api/leaveAdapter";
import { parsePayrollRow, buildPayrollPayload } from "@/modules/payroll/api/payrollAdapter";
import { employeesApi } from "@/modules/employees/api/employeeApi";
import { ENDPOINTS } from "@/app/config/endpoints";
import {
  mockAdminAttendanceApi,
  mockAdminLeaveApi,
  mockAdminPayrollApi,
  type AdminAttendanceRecord,
  type AttendanceCorrection,
  type AttendanceListParams,
  type AdminLeaveRequest,
  type LeaveListParams,
  type AdminPayrollRecord,
  type PayrollListParams,
  type GeneratePayrollInput,
  type ListResult,
} from "@/modules/settings/mocks/adminOpsMockData";

export type {
  AdminAttendanceRecord,
  AdminAttendanceStatus,
  AttendanceCorrection,
  AttendanceListParams,
  AdminLeaveRequest,
  AdminLeaveStatus,
  LeaveListParams,
  AdminPayrollRecord,
  PayrollListParams,
  GeneratePayrollInput,
  ListResult,
} from "@/modules/settings/mocks/adminOpsMockData";

const attendanceQs = (params: AttendanceListParams) => {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.departmentId) search.set("departmentId", params.departmentId);
  if (params.employeeId) search.set("employeeId", params.employeeId);
  if (params.status) search.set("status", params.status);
  if (params.date) search.set("date", params.date);
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
  list: (params: AttendanceListParams = {}) =>
    withDemoFallback<ListResult<AdminAttendanceRecord>>(
      async () => {
        const raw = await apiRequest<unknown>(`${ENDPOINTS.attendance.base}${attendanceQs(params)}`);
        const rows = await adaptAdminAttendanceRows(raw);
        return applyAttendanceFilters(rows, params);
      },
      () => mockAdminAttendanceApi.list(params),
    ),

  correct: (id: string, payload: AttendanceCorrection) =>
    withDemoFallback<AdminAttendanceRecord>(
      async () => {
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
        };
      },
      () => mockAdminAttendanceApi.correct(id, payload),
    ),

  // HR/Admin marking check-in/check-out on behalf of a single employee (e.g.
  // front-desk attendance). Mirrors the self-service checkIn/checkOut in
  // hrApi.ts but takes an explicit employeeId instead of the current session.
  getTodayFor: (employeeId: string) =>
    withDemoFallback<AdminAttendanceRecord | null>(
      async () => {
        const today = new Date().toISOString().slice(0, 10);
        const raw = await apiRequest<unknown>(ENDPOINTS.attendance.base);
        const rows = await adaptAdminAttendanceRows(raw);
        return rows.find((r) => r.employeeId === employeeId && r.attendanceDate === today) ?? null;
      },
      () => mockAdminAttendanceApi.getToday(employeeId),
    ),

  checkInEmployee: (employeeId: string) =>
    withDemoFallback<AdminAttendanceRecord>(
      async () => {
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
        };
      },
      () => mockAdminAttendanceApi.checkInEmployee(employeeId),
    ),

  checkOutEmployee: (employeeId: string) =>
    withDemoFallback<AdminAttendanceRecord>(
      async () => {
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
      () => mockAdminAttendanceApi.checkOutEmployee(employeeId),
    ),
};

export const adminLeaveApi = {
  list: (params: LeaveListParams = {}) =>
    withDemoFallback<ListResult<AdminLeaveRequest>>(
      async () => {
        const raw = await apiRequest<unknown>(`${ENDPOINTS.leaveRequests.base}${leaveQs(params)}`);
        const rows = await adaptAdminLeaveRows(raw);
        return applyLeaveFilters(rows, params);
      },
      () => mockAdminLeaveApi.list(params),
    ),

  approve: (id: string) =>
    withDemoFallback<AdminLeaveRequest>(
      async () => {
        const updated = await apiRequest<Record<string, unknown>>(ENDPOINTS.leaveRequests.byId(id), {
          method: "PATCH",
          body: { status: "Approved" },
        });
        const rows = await adaptAdminLeaveRows([updated]);
        return rows[0];
      },
      () => mockAdminLeaveApi.setStatus(id, "Approved"),
    ),

  reject: (id: string) =>
    withDemoFallback<AdminLeaveRequest>(
      async () => {
        const updated = await apiRequest<Record<string, unknown>>(ENDPOINTS.leaveRequests.byId(id), {
          method: "PATCH",
          body: { status: "Rejected" },
        });
        const rows = await adaptAdminLeaveRows([updated]);
        return rows[0];
      },
      () => mockAdminLeaveApi.setStatus(id, "Rejected"),
    ),

  // HR/Admin filing a leave request on behalf of a single employee (e.g.
  // logging a verbal/phoned-in request). Same confirmed POST contract as
  // the self-service applyLeave in hrApi.ts: leave_type/start_date/
  // end_date/reason/status/user_id, all snake_case.
  applyFor: (employeeId: string, payload: { leaveTypeName: string; startDate: string; endDate: string; reason: string }) =>
    withDemoFallback<AdminLeaveRequest>(
      async () => {
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
      () => mockAdminLeaveApi.applyFor(employeeId, payload),
    ),
};

export const adminPayrollApi = {
  list: (params: PayrollListParams = {}) =>
    withDemoFallback<ListResult<AdminPayrollRecord>>(
      async () => {
        const raw = await apiRequest<unknown>(ENDPOINTS.payroll.base);
        const rows = await adaptAdminPayrollRows(raw);
        return applyPayrollFilters(rows, params);
      },
      () => mockAdminPayrollApi.list(params),
    ),

  // HR/Admin generating a payslip for a single employee for a given month.
  // Confirmed POST contract (per the live Swagger doc): payroll_month
  // (first-of-month date string), basic_salary/allowance/bonus/deduction/
  // tax/net_salary as numbers, payment_date, user_id — all snake_case.
  generate: (employeeId: string, input: GeneratePayrollInput) =>
    withDemoFallback<AdminPayrollRecord>(
      async () => {
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
      () => mockAdminPayrollApi.generate(employeeId, input),
    ),

  remove: (payrollId: string) =>
    withDemoFallback<{ payrollId: string }>(
      async () => {
        await apiRequest<unknown>(ENDPOINTS.payroll.byId(payrollId), { method: "DELETE" });
        return { payrollId };
      },
      () => mockAdminPayrollApi.remove(payrollId),
    ),
};
