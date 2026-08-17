// API module for the Employee Leave Management report (Admin/HR "Leave"
// tab): one row per (employee, leave type) with entitlement / used /
// remaining / pending, backed by GET /leave-entitlements/balances.
//
// Talks to the real backend through the shared transport in lib/apiClient
// (JWT bearer, refresh cookie, 401 replay, timeout). There is NO demo/mock
// fallback: real backend errors surface to the page as an `ApiError` rather
// than being swallowed into a synthesized balance table.

import { apiRequest, ENDPOINTS, normalizeListResult } from "@/lib/apiClient";

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

export const leaveEntitlementsApi = {
  list: async (params: LeaveBalanceListParams = {}): Promise<LeaveBalanceListResult> => {
    const raw = await apiRequest<unknown>(`${ENDPOINTS.leaveEntitlements.balances}${qs(params)}`);
    const normalized = normalizeListResult<ApiLeaveBalanceRow>(raw);
    return { data: normalized.data.map(adaptRow), total: normalized.total };
  },
};
