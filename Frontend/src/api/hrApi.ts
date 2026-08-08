// API modules for the Phase 1 employee self-service screens:
// Attendance, Leave, Payroll, Notifications.
//
// Appraisal is NOT here — it has a real backend facade and lives in
// modules/appraisal/api/appraisalApi.ts, which uses lib/apiClient (no demo
// fallback, so errors surface instead of turning into mock data).
//
// Same contract as authApi/profileApi in api.ts: every call tries the real
// NestJS backend first (apiRequest, which itself pings /health and attaches
// the JWT), and only falls back to hardcoded demo data when the backend is
// completely unreachable. Real backend errors (validation, insufficient
// leave balance, etc.) are never swallowed — only "can't reach the API at
// all" triggers the fallback.
//
// Endpoint paths below are matched against the live Swagger doc where a
// route actually exists there today. Two tables (`Attendance`,
// `LeaveRequests`) are exposed as plain REST CRUD (`/attendance`,
// `/leave-requests` — POST/GET/GET :id/PATCH/DELETE, no convenience routes
// like /check-in or /apply), so this module builds the old
// "check in / today / my leaves" API surface on top of that generic CRUD
// client-side. Payroll and Appraisal have DB tables in the ERD but no REST
// controller in the Swagger doc yet — those paths are kept schema-shaped
// (plural of the table name, same convention as every confirmed route) so
// they start working the moment the backend adds them; until then the 404
// handler in api.ts routes them to demo data. Notifications *is* a confirmed
// live route (full CRUD at /notifications) — see the dedicated comment
// above that block for its specific shape.

import { apiRequest, withDemoFallback } from "@/api/client";
import { parseAttendanceRow } from "@/modules/attendance/api/attendanceAdapter";
import { parseLeaveRow } from "@/modules/leave/api/leaveAdapter";
import { parsePayrollRow, type ParsedPayrollRow } from "@/modules/payroll/api/payrollAdapter";
import { ENDPOINTS } from "@/app/config/endpoints";
import { leaveTypesApi } from "@/modules/settings/api/settingsApi";
import { getSession } from "@/utils/auth";
import {
 mockAttendanceApi,
 mockLeaveApi,
 mockPayrollApi,
 mockNotificationApi,
 leaveTypes,
 type AttendanceRecord,
 type AttendanceStatus,
 type LeaveType,
 type LeaveRequest,
 type LeaveStatus,
 type PayrollRecord,
 type NotificationRecord,
 type NotificationType,
} from "@/mocks/hrMockData";

function currentEmployeeId(): string | undefined {
 return getSession()?.user.employeeId;
}

// Backend responses may come back either as a bare array or as the
// `{ data, total }` list envelope used elsewhere in this app (see
// settingsApi.ts / employeeApi.ts) — normalize both to an array.
function toArray<T>(res: T[] | { data: T[] }): T[] {
 return Array.isArray(res) ? res : (res?.data ?? []);
}

// Adapts one row from `GET /attendance` to the frontend's AttendanceRecord
// shape. The live rows nest the employee under `user` (e.g. `user.user_id`)
// and the shift under `shift` (e.g. `shift.shift_name`) rather than exposing
// flat `employee_id`/`shift_id` columns — see attendanceAdapter.ts for the
// confirmed shape. `working_hours`/`overtime_hours` also arrive as numeric
// strings (e.g. `"7.76"`), not numbers.
function adaptAttendanceRow(row: any): AttendanceRecord {
 const parsed = parseAttendanceRow(row);
 return {
 attendanceId: parsed.attendanceId,
 employeeId: parsed.employeeId,
 shiftId: parsed.shiftId,
 shiftName: parsed.shiftName,
 attendanceDate: parsed.attendanceDate,
 checkIn: parsed.checkIn,
 checkOut: parsed.checkOut,
 workingHours: parsed.workingHours,
 overtimeHours: parsed.overtimeHours,
 isOvertime: parsed.isOvertime,
 status: parsed.status as AttendanceStatus,
 };
}

// What `GET /attendance/me/today` returns. The three flags are the server's
// answer to "what may this employee do right now", which is what the buttons
// render from — see the comment on `getToday` below.
export type TodayAttendance = {
 date: string;
 isWorkingDay: boolean;
 canCheckIn: boolean;
 canCheckOut: boolean;
 attendance: AttendanceRecord | null;
 shiftName: string | null;
 shiftStart: string | null;
 shiftEnd: string | null;
};

function adaptTodayStatus(res: any): TodayAttendance {
 const shift = res?.shift ?? null;
 return {
 date: String(res?.date ?? new Date().toISOString().slice(0, 10)),
 isWorkingDay: res?.is_working_day !== false,
 canCheckIn: res?.can_check_in === true,
 canCheckOut: res?.can_check_out === true,
 attendance: res?.attendance ? adaptAttendanceRow(res.attendance) : null,
 shiftName: shift?.shift_name ?? null,
 shiftStart: shift?.start_time ? String(shift.start_time).slice(0, 5) : null,
 shiftEnd: shift?.end_time ? String(shift.end_time).slice(0, 5) : null,
 };
}

// A demo-mode stand-in, so the fallback path answers the same shape. The mock
// has no shift and no working-day calendar, so it infers the flags from the
// stamps exactly as the old UI did — that inference is only ever correct here,
// where there is no server to ask.
async function mockTodayStatus(): Promise<TodayAttendance> {
 const rec = await mockAttendanceApi.getToday();
 return {
 date: new Date().toISOString().slice(0, 10),
 isWorkingDay: true,
 canCheckIn: !rec?.checkIn,
 canCheckOut: !!rec?.checkIn && !rec?.checkOut,
 attendance: rec,
 shiftName: rec?.shiftName ?? null,
 shiftStart: null,
 shiftEnd: null,
 };
}

// ---- Attendance ------------------------------------------------------------
// The four self-service calls below hit dedicated routes rather than the
// generic CRUD table. That is not cosmetic: `POST /attendance` needs
// `attendance.create` and `GET /attendance` needs `attendance.view`, neither of
// which the Employee role holds — so the old flow 403'd, `withDemoFallback`
// swallowed it, and the button appeared to work while writing nothing. The
// `/attendance/me/*` and `/attendance/check-*` routes need only a valid token
// and scope themselves to that token's employee.
//
// They also move four decisions server-side that the browser had no business
// making: the clock (a client could post any time), the employee (`user_id`
// used to be supplied by the caller, so anyone with `attendance.create` could
// punch someone else's clock), Late vs Present (was a hardcoded 09:15; is now
// the employee's own shift start plus its grace period), and working/overtime
// hours (were computed client-side and submitted, i.e. trivially forgeable).
export const attendanceApi = {
 // Returns the whole status object, not just the row: the buttons need
 // `canCheckIn`/`canCheckOut` from the server. Inferring them from the stamps
 // gets the common case right but silently disagrees with the server about
 // every edge case it guards — a row created by an absence sweep, an account
 // deactivated mid-day, a second tab that already checked in.
 getToday: () =>
 withDemoFallback<TodayAttendance>(
 async () => adaptTodayStatus(await apiRequest<any>(ENDPOINTS.attendance.me.today)),
 () => mockTodayStatus(),
 ),

 checkIn: () =>
 withDemoFallback<AttendanceRecord>(
 async () =>
 adaptAttendanceRow(
 await apiRequest<any>(ENDPOINTS.attendance.me.checkIn, { method: "POST" }),
 ),
 () => mockAttendanceApi.checkIn(),
 ),

 checkOut: () =>
 withDemoFallback<AttendanceRecord>(
 async () =>
 adaptAttendanceRow(
 await apiRequest<any>(ENDPOINTS.attendance.me.checkOut, { method: "POST" }),
 ),
 () => mockAttendanceApi.checkOut(),
 ),

 // Narrowed server-side by employee and month, so this no longer pulls the
 // entire organisation's attendance down to filter it in the browser.
 getHistory: (params: { month: number; year: number }) =>
 withDemoFallback<AttendanceRecord[]>(
 async () => {
 const rows = toArray(
 await apiRequest<any>(
 `${ENDPOINTS.attendance.me.history}?month=${params.month}&year=${params.year}`,
 ),
 );
 return rows.map(adaptAttendanceRow);
 },
 () => mockAttendanceApi.getHistory(params),
 ),
};

// Adapts one row from `GET /leave-requests/me` to the frontend's LeaveRequest
// shape. `leaveTypeId` now comes from the real `leave_type_id` FK when the
// backend supplies it (it's what balance deduction keys off); the name-based
// lookup against the demo list is only a fallback for rows created before that
// column existed.
function adaptLeaveRow(row: any): LeaveRequest {
 const parsed = parseLeaveRow(row);
 const realTypeId = row?.leave_type_id ?? row?.leaveTypeId ?? row?.leaveTypeRef?.leave_type_id;
 return {
 leaveId: parsed.leaveId,
 employeeId: parsed.employeeId,
 leaveTypeId:
 realTypeId ??
 leaveTypes.find((t) => t.leaveTypeName === parsed.leaveTypeName)?.leaveTypeId ??
 "LT-OTHER",
 leaveTypeName: parsed.leaveTypeName,
 startDate: parsed.startDate,
 endDate: parsed.endDate,
 totalDays: parsed.totalDays,
 durationType: parsed.durationType,
 reason: parsed.reason,
 status: parsed.status as LeaveStatus,
 appliedOn: parsed.appliedOn,
 approvedOn: parsed.approvedOn,
 approvedBy: parsed.approvedByName,
 // No equivalent column on the schema's LeaveRequests table.
 remarks: null,
 };
}

/** The four duration options the backend's `duration_type` column accepts. */
export type LeaveDurationType = "Full Day" | "First Half" | "Second Half" | "Multiple Days";

export type ApplyLeavePayload = {
 /** Real `leave_type_id` UUID from `GET /leave-types`. */
 leaveTypeId: string;
 /** Shown to the user and stored in the free-text `leave_type` column. */
 leaveTypeName: string;
 startDate: string;
 /** Equals `startDate` for every duration except "Multiple Days". */
 endDate: string;
 durationType: LeaveDurationType;
 reason: string;
 attachmentPath?: string;
 attachmentName?: string;
};

/** One row of the signed-in employee's own balance from /leave-entitlements/me/balances. */
export type MyLeaveBalance = {
 leaveTypeId: string;
 leaveTypeName: string;
 allocated: number;
 used: number;
 pending: number;
 remaining: number;
};

/** One entry of the signed-in employee's own leave-history ledger. */
export type MyLeaveHistoryEntry = {
 historyId: string;
 leaveTypeName: string;
 year: number;
 /** "Entitlement" | "Adjustment" | "Leave Taken" | "Carry Forward" | "Expiry". */
 type: string;
 /** Signed days this entry moved the balance (+ credit / − debit). */
 amount: number;
 /** Remaining balance for this leave type after the entry. */
 balanceAfter: number;
 note: string | null;
 performedByName: string | null;
 createdAt: string;
};

/** Wire shape of a balance row from `GET /leave-entitlements/me/balances`
 * (same row shape as the HR report, minus the person columns). */
type MyBalanceRow = {
 leave_type_id?: string;
 leave_type_name?: string;
 total_entitlement?: number | string;
 used_days?: number | string;
 remaining_days?: number | string;
 pending_requests?: number | string;
};

// numeric columns come back from pg as strings ("12.00"), so coerce both.
const toNum = (v: unknown): number => {
 const n = typeof v === "number" ? v : Number(v ?? 0);
 return Number.isFinite(n) ? n : 0;
};

function adaptBalanceRow(row: MyBalanceRow): MyLeaveBalance {
 return {
 leaveTypeId: String(row.leave_type_id ?? ""),
 leaveTypeName: String(row.leave_type_name ?? "Leave"),
 allocated: toNum(row.total_entitlement),
 used: toNum(row.used_days),
 pending: toNum(row.pending_requests),
 remaining: toNum(row.remaining_days),
 };
}

function adaptHistoryEntry(row: any): MyLeaveHistoryEntry {
 const performedBy = row?.performedBy ?? row?.performed_by ?? null;
 const performedByName = performedBy
 ? `${String(performedBy.first_name ?? "")} ${String(performedBy.last_name ?? "")}`.trim() || null
 : null;
 return {
 historyId: String(row?.leave_history_id ?? ""),
 leaveTypeName: String(row?.leaveType?.name ?? row?.leave_type_name ?? "Leave"),
 year: toNum(row?.year) || new Date().getFullYear(),
 type: String(row?.type ?? "Adjustment"),
 amount: toNum(row?.amount),
 balanceAfter: toNum(row?.balance_after),
 note: row?.note ?? null,
 performedByName,
 createdAt: String(row?.created_at ?? row?.createdAt ?? new Date().toISOString()),
 };
}

// ---- Leave — self-service at /leave-requests/me -----------------------------
export const leaveApi = {
 // Real catalog from `GET /leave-types` (active types only). This matters
 // beyond cosmetics: the UUIDs it returns are what `leave_type_id` must carry
 // for the backend to deduct balance on approval — a request built from the
 // old hardcoded "LT-1" ids could never be approved.
 //
 // The Employee role holds `leave-types.view` as of migration
 // 1788500000000; the demo list is only used when the backend is unreachable.
 getLeaveTypes: () =>
 withDemoFallback<LeaveType[]>(
 () => leaveTypesApi.listAll(),
 () => Promise.resolve(leaveTypes),
 ),

 // Real balances from the token-scoped /leave-entitlements/me/balances route
 // (added alongside /leave-requests/me: same pattern — no permission beyond a
 // valid JWT, identity comes from the token, so the Employee role can finally
 // read authoritative numbers instead of illustrative demo cards). The demo
 // fallback only kicks in when the backend is unreachable.
 getBalance: () =>
 withDemoFallback<MyLeaveBalance[]>(
 async () => {
 const rows = toArray<MyBalanceRow>(await apiRequest<any>(ENDPOINTS.leaveEntitlements.me.balances));
 return rows.map(adaptBalanceRow);
 },
 () => mockLeaveApi.getBalance(),
 ),

 // The real entitlement ledger (Entitlement / Adjustment / Leave Taken /
 // Carry Forward / Expiry), token-scoped to the signed-in employee — this is
 // the "Leave History" the balance numbers actually come from, as opposed to
 // the request list above. There is no mock ledger: the demo fallback is an
 // empty list, which the section's empty state renders as-is.
 getMyHistory: (params?: { year?: number; type?: string }) =>
 withDemoFallback<MyLeaveHistoryEntry[]>(
 async () => {
 const qs = new URLSearchParams();
 if (params?.year) qs.set("year", String(params.year));
 if (params?.type) qs.set("type", params.type);
 const suffix = qs.toString() ? `?${qs.toString()}` : "";
 const rows = toArray(
 await apiRequest<any>(`${ENDPOINTS.leaveEntitlements.me.history}${suffix}`),
 );
 return rows.map(adaptHistoryEntry);
 },
 () => Promise.resolve([]),
 ),

 // Scoped server-side to the token's employee, so this no longer pulls the
 // whole organisation's leave down to filter it in the browser (which also
 // required a permission the Employee role does not hold).
 getMyLeaves: () =>
 withDemoFallback<LeaveRequest[]>(
 async () => {
 const rows = toArray(await apiRequest<any>(ENDPOINTS.leaveRequests.me));
 return rows.map(adaptLeaveRow).sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));
 },
 () => mockLeaveApi.getMyLeaves(),
 ),

 // POSTs to the token-scoped route: `user_id` is taken from the JWT and the
 // status is forced to Pending server-side, so neither is sent here.
 // `is_half_day` and `days_count` are derived by the backend from
 // `duration_type` — sending them would only risk disagreeing with it.
 applyLeave: (payload: ApplyLeavePayload) =>
 withDemoFallback<LeaveRequest>(
 async () => {
 const created = await apiRequest<any>(ENDPOINTS.leaveRequests.me, {
 method: "POST",
 body: {
 leave_type: payload.leaveTypeName,
 leave_type_id: payload.leaveTypeId,
 start_date: payload.startDate,
 end_date: payload.endDate,
 duration_type: payload.durationType,
 reason: payload.reason,
 ...(payload.attachmentPath ? { attachment_path: payload.attachmentPath } : {}),
 ...(payload.attachmentName ? { attachment_name: payload.attachmentName } : {}),
 },
 });
 return adaptLeaveRow(created);
 },
 () => mockLeaveApi.applyLeave(payload),
 ),
};

// ---- Payroll — confirmed live REST at /payroll -----------------------------
// Confirmed against the live Swagger doc: `GET /api/payroll` returns every
// payroll row (basic_salary/allowance/bonus/deduction/tax/net_salary as
// numeric strings, `payroll_month` as a first-of-month date string, and the
// employee nested under `user`) with no `?employeeId=` filter — same
// situation as `/attendance` and `/leave-requests`, so filtering to the
// current employee happens client-side after fetching the full list. There's
// no separate pay-components table exposed, so the itemized breakdown shown
// in the UI is synthesized from the flat columns (see payrollAdapter.ts).
function toPayrollRecord(row: ParsedPayrollRow): PayrollRecord {
 const components: PayrollRecord["components"] = [
 { payComponentId: `${row.payrollId}-basic`, payrollId: row.payrollId, componentName: "Basic Salary", componentType: "Earning", amount: row.basicSalary },
 { payComponentId: `${row.payrollId}-allowance`, payrollId: row.payrollId, componentName: "Allowance", componentType: "Earning", amount: row.allowance },
 ...(row.bonus > 0
 ? [{ payComponentId: `${row.payrollId}-bonus`, payrollId: row.payrollId, componentName: "Bonus", componentType: "Earning" as const, amount: row.bonus }]
 : []),
 { payComponentId: `${row.payrollId}-deduction`, payrollId: row.payrollId, componentName: "Deduction", componentType: "Deduction", amount: row.deduction },
 { payComponentId: `${row.payrollId}-tax`, payrollId: row.payrollId, componentName: "Tax", componentType: "Deduction", amount: row.tax },
 ];
 return {
 payrollId: row.payrollId,
 employeeId: row.employeeId,
 payrollMonth: row.payrollMonth,
 payrollYear: row.payrollYear,
 basicSalary: row.basicSalary,
 allowance: row.allowance,
 bonus: row.bonus,
 deduction: row.deduction,
 tax: row.tax,
 netSalary: row.netSalary,
 paymentDate: row.paymentDate,
 generatedDate: row.paymentDate ?? new Date().toISOString().slice(0, 10),
 status: row.status,
 components,
 };
}

async function fetchAllPayroll(): Promise<ParsedPayrollRow[]> {
 const rows = await apiRequest<any>(ENDPOINTS.payroll.base);
 return (Array.isArray(rows) ? rows : (rows?.data ?? [])).map(parsePayrollRow);
}

export const payrollApi = {
 getMyPayroll: () =>
 withDemoFallback<PayrollRecord[]>(
 async () => {
 const employeeId = currentEmployeeId();
 const rows = await fetchAllPayroll();
 return rows
 .filter((r) => r.employeeId === employeeId)
 .sort((a, b) => (a.payrollYear !== b.payrollYear ? b.payrollYear - a.payrollYear : b.payrollMonth - a.payrollMonth))
 .map(toPayrollRecord);
 },
 () => mockPayrollApi.getMyPayroll(),
 ),

 getPayslip: (payrollId: string) =>
 withDemoFallback<PayrollRecord>(
 async () => {
 const row = await apiRequest<any>(ENDPOINTS.payroll.byId(payrollId));
 return toPayrollRecord(parsePayrollRow(row));
 },
 () => mockPayrollApi.getPayslip(payrollId),
 ),
};

// ---- Appraisal -------------------------------------------------------------
// Intentionally absent. Appraisal is served by the real /appraisal/* facade —
// see modules/appraisal/api/appraisalApi.ts (myAppraisalApi for an employee's
// own history, teamAppraisalApi for a Team Lead, formsApi for HR). The old
// entry here pointed at /performance-reviews?employeeId=, which no longer
// exists, so it silently resolved to demo data.

// ---- Notifications — confirmed live REST CRUD at /notifications -----------
// Confirmed against the live Swagger doc: `POST /api/notifications` takes
// `{ title, message, type, createdBy }` (createdBy is the creating user's
// user_id) and `GET /api/notifications` returns every notification with the
// full `createdBy` user nested inside — there is no `?employeeId=` filter,
// no `isRead` column, and no dedicated "mark all read" route. In other
// words the schema models company-wide broadcasts (Admin/HR → everyone),
// not per-recipient inbox rows. `GET`'s example response also doesn't echo
// back the `type` it was created with, so the adapter below defaults to
// "General" when it's missing rather than assuming the field is dropped
// server-side for good.
function adaptNotificationRow(row: any): NotificationRecord {
 const createdBy = row?.createdBy ?? null;
 const createdByName = createdBy ? `${createdBy.first_name ?? ""} ${createdBy.last_name ?? ""}`.trim() : undefined;
 return {
 notificationId: String(row?.notification_id ?? row?.notificationId ?? row?.id ?? ""),
 title: row?.title ?? "",
 message: row?.message ?? "",
 type: (row?.type as NotificationType) ?? "General",
 isRead: false, // stitched in client-side by NotificationsContext (see there for why)
 createdAt: row?.created_at ?? row?.createdAt ?? new Date().toISOString(),
 createdById: createdBy?.user_id,
 createdByName: createdByName || undefined,
 };
}

export const notificationApi = {
 getAll: () =>
 withDemoFallback<NotificationRecord[]>(
 async () => {
 const rows = toArray(await apiRequest<any>(ENDPOINTS.notifications.base));
 return rows.map(adaptNotificationRow).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
 },
 () => mockNotificationApi.getAll(),
 ),

 // `createdBy` defaults to the signed-in user (matches the confirmed
 // Swagger example body), but is accepted as an override for admin
 // "send on behalf of" tooling if that's ever added.
 create: (payload: { title: string; message: string; type: NotificationType; createdBy?: string }) =>
 withDemoFallback<NotificationRecord>(
 async () => {
 const created = await apiRequest<any>(ENDPOINTS.notifications.base, {
 method: "POST",
 body: {
 title: payload.title,
 message: payload.message,
 type: payload.type,
 createdBy: payload.createdBy ?? currentEmployeeId(),
 },
 });
 return adaptNotificationRow(created);
 },
 () => mockNotificationApi.create({ ...payload, createdById: currentEmployeeId() }),
 ),

 update: (notificationId: string, payload: { title: string; message: string; type: NotificationType }) =>
 withDemoFallback<NotificationRecord>(
 async () => {
 const updated = await apiRequest<any>(ENDPOINTS.notifications.byId(notificationId), {
 method: "PATCH",
 body: payload,
 });
 return adaptNotificationRow(updated);
 },
 () => mockNotificationApi.update(notificationId, payload),
 ),

 remove: (notificationId: string) =>
 withDemoFallback<{ notificationId: string }>(
 () => apiRequest<{ notificationId: string }>(ENDPOINTS.notifications.byId(notificationId), { method: "DELETE" }),
 () => mockNotificationApi.remove(notificationId),
 ),
};

export type {
 AttendanceRecord,
 AttendanceStatus,
 LeaveType,
 LeaveRequest,
 LeaveStatus,
 PayrollRecord,
 PayComponent,
 NotificationRecord,
 NotificationType,
} from "@/mocks/hrMockData";
export { monthLabel } from "@/mocks/hrMockData";
