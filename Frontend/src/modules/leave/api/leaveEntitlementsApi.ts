// API module for the Employee Leave Management report (Admin/HR "Leave"
// tab): one row per (employee, leave type) with entitlement / used /
// remaining / pending, backed by GET /leave-entitlements/balances.
//
// Same contract as adminOpsApi.ts / employeeApi.ts: try the real backend
// first (apiRequest — pings the API root, attaches the JWT), and only fall
// back to a client-synthesized demo dataset when the backend is completely
// unreachable. Real backend errors are never swallowed.

import { apiRequest, withDemoFallback, normalizeListResult } from "@/api/client";
import { ENDPOINTS } from "@/app/config/endpoints";
import { employeesApi } from "@/modules/employees/api/employeeApi";
import { leaveTypes as mockLeaveTypes } from "@/mocks/hrMockData";

export type LeaveBalanceStatus = "active" | "inactive";

export type LeaveBalanceRow = {
  userId: string;
  employeeCode: string;
  employeeName: string;
  departmentId: string;
  departmentName: string;
  designationName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  totalEntitlement: number;
  usedLeave: number;
  remainingLeave: number;
  pendingRequests: number;
  status: LeaveBalanceStatus;
};

export type LeaveBalanceListParams = {
  search?: string;
  page?: number;
  pageSize?: number;
  departmentId?: string;
  leaveTypeId?: string;
  employeeId?: string;
  status?: LeaveBalanceStatus | "";
  sortBy?: "employee_name" | "department" | "leave_type" | "remaining" | "status" | "";
  sortOrder?: "ASC" | "DESC";
};

export type LeaveBalanceListResult = { data: LeaveBalanceRow[]; total: number };

type ApiLeaveBalanceRow = {
  user_id: string;
  employee_code: string;
  employee_name: string;
  department: string | null;
  designation: string | null;
  leave_type_id: string;
  leave_type_name: string;
  total_entitlement: number;
  used_days: number;
  remaining_days: number;
  pending_requests: number;
  status: "active" | "inactive";
};

function adaptRow(raw: ApiLeaveBalanceRow): LeaveBalanceRow {
  return {
    userId: raw.user_id,
    employeeCode: raw.employee_code,
    employeeName: raw.employee_name,
    departmentId: "",
    departmentName: raw.department ?? "—",
    designationName: raw.designation ?? "—",
    leaveTypeId: raw.leave_type_id,
    leaveTypeName: raw.leave_type_name,
    totalEntitlement: Number(raw.total_entitlement) || 0,
    usedLeave: Number(raw.used_days) || 0,
    remainingLeave: Number(raw.remaining_days) || 0,
    pendingRequests: Number(raw.pending_requests) || 0,
    status: raw.status,
  };
}

function qs(params: LeaveBalanceListParams): string {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.page) search.set("page", String(params.page));
  // pageSize=0 means "everything matching the filters" (export). The
  // backend's `limit` is a 1-100 bounded field, so ask for the max page
  // size instead of 0 and let the export helper page through if needed.
  if (params.pageSize) search.set("limit", String(params.pageSize));
  if (params.departmentId) search.set("department_id", params.departmentId);
  if (params.leaveTypeId) search.set("leave_type_id", params.leaveTypeId);
  if (params.employeeId) search.set("user_id", params.employeeId);
  if (params.status) search.set("status", params.status);
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortOrder) search.set("sortOrder", params.sortOrder);
  const str = search.toString();
  return str ? `?${str}` : "";
}

// ---- Demo fallback: synthesize a deterministic-but-plausible balance ------
// table from whatever employees the demo store already has, so the tab is
// still usable when the real API is unreachable.

function seedFor(a: string, b: string): number {
  let hash = 0;
  const s = `${a}:${b}`;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

async function buildDemoRows(): Promise<LeaveBalanceRow[]> {
  const employeesRes = await employeesApi.list({ pageSize: 1000 });
  const rows: LeaveBalanceRow[] = [];
  for (const e of employeesRes.data) {
    for (const lt of mockLeaveTypes) {
      const seed = seedFor(e.employeeId, lt.leaveTypeId);
      const allocated = lt.allocatedDays || 12;
      const used = allocated > 0 ? seed % (allocated + 1) : 0;
      const pending = seed % 5 === 0 ? 1 + (seed % 3) : 0;
      rows.push({
        userId: e.employeeId,
        employeeCode: e.employeeCode,
        employeeName: `${e.firstName} ${e.lastName}`.trim(),
        departmentId: e.departmentId,
        departmentName: e.departmentName,
        designationName: e.designationName,
        leaveTypeId: lt.leaveTypeId,
        leaveTypeName: lt.leaveTypeName,
        totalEntitlement: allocated,
        usedLeave: used,
        remainingLeave: Math.max(0, allocated - used),
        pendingRequests: pending,
        status: e.status === "active" ? "active" : "inactive",
      });
    }
  }
  return rows;
}

function applyDemoFilters(rows: LeaveBalanceRow[], params: LeaveBalanceListParams): LeaveBalanceListResult {
  const needle = params.search?.trim().toLowerCase();
  let filtered = rows.filter((r) => {
    if (needle) {
      const haystack = [r.employeeName, r.employeeCode, r.departmentName, r.designationName, r.leaveTypeName]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (params.departmentId && r.departmentId !== params.departmentId) return false;
    if (params.leaveTypeId && r.leaveTypeId !== params.leaveTypeId) return false;
    if (params.employeeId && r.userId !== params.employeeId) return false;
    if (params.status && r.status !== params.status) return false;
    return true;
  });

  if (params.sortBy) {
    const dir = params.sortOrder === "ASC" ? 1 : -1;
    const key: Record<string, (r: LeaveBalanceRow) => string | number> = {
      employee_name: (r) => r.employeeName,
      department: (r) => r.departmentName,
      leave_type: (r) => r.leaveTypeName,
      remaining: (r) => r.remainingLeave,
      status: (r) => r.status,
    };
    const accessor = key[params.sortBy];
    if (accessor) {
      filtered = [...filtered].sort((a, b) => {
        const av = accessor(a);
        const bv = accessor(b);
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
  }

  const total = filtered.length;
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 10;
  const start = pageSize > 0 ? (page - 1) * pageSize : 0;
  const data = pageSize > 0 ? filtered.slice(start, start + pageSize) : filtered;
  return { data, total };
}

export const leaveEntitlementsApi = {
  list: (params: LeaveBalanceListParams = {}) =>
    withDemoFallback<LeaveBalanceListResult>(
      async () => {
        const raw = await apiRequest<unknown>(`${ENDPOINTS.leaveEntitlements.balances}${qs(params)}`);
        const normalized = normalizeListResult<ApiLeaveBalanceRow>(raw);
        return { data: normalized.data.map(adaptRow), total: normalized.total };
      },
      async () => applyDemoFilters(await buildDemoRows(), params),
    ),
};
