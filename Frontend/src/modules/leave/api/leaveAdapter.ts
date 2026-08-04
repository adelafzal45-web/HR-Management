// Shared adapter for `GET /leave-requests` rows from the live backend.
//
// Confirmed shape (see the live Swagger sample response for GET /api/leave-requests):
// {
// leave_id, leave_type, start_date, end_date, reason, status,
// applied_date, approved_date,
// user: { user_id, employee_code, first_name, last_name, ... },
// approved_by: { user_id, employee_code, first_name, last_name, ... } | null,
// }
//
// Just like attendance rows, the employee is nested under `user` (no flat
// `employee_id`/`employee_code` columns on the row itself), there's no
// `department`/`total_days` on the row at all, and the list route
// (`findAll()`) takes no query params — every filter has to happen
// client-side after fetching the full list, same as attendanceAdapter.ts.
//
// Used by both the employee self-service module (hrApi.ts) and the
// HR/Administrator org-wide module (adminOpsApi.ts) so the two stay in sync.

const str = (v: unknown, fallback = ""): string =>
 typeof v === "string" ? v : v == null ? fallback : String(v);

const nested = (v: unknown, key: string): unknown =>
 v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;

const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && v !== "");

export type ParsedLeaveRow = {
 leaveId: string;
 employeeId: string;
 employeeCode: string;
 employeeName: string;
 leaveTypeName: string;
 startDate: string;
 endDate: string;
 totalDays: number;
 reason: string;
 status: string;
 appliedOn: string;
 approvedOn: string | null;
 approvedById: string | null;
 approvedByName: string | null;
};

export function daysBetweenInclusive(start: string, end: string): number {
 if (!start || !end) return 0;
 const s = new Date(start);
 const e = new Date(end);
 const days = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
 return Number.isFinite(days) && days > 0 ? days : 0;
}

export function parseLeaveRow(row: Record<string, unknown>): ParsedLeaveRow {
 const user = row.user as Record<string, unknown> | undefined;
 const approver = (pick(row.approvedBy, row.approved_by) ?? undefined) as Record<string, unknown> | undefined;

 const firstName = str(pick(row.firstName, nested(user, "first_name"), nested(user, "firstName")));
 const lastName = str(pick(row.lastName, nested(user, "last_name"), nested(user, "lastName")));

 const approverFirst = str(pick(nested(approver, "first_name"), nested(approver, "firstName")));
 const approverLast = str(pick(nested(approver, "last_name"), nested(approver, "lastName")));
 const approverName = [approverFirst, approverLast].filter(Boolean).join(" ") || null;

 const startDate = str(pick(row.startDate, row.start_date));
 const endDate = str(pick(row.endDate, row.end_date));

 return {
 leaveId: str(pick(row.leaveId, row.leave_id, row.id)),
 employeeId: str(
 pick(row.employeeId, row.employee_id, row.user_id, nested(user, "user_id"), nested(user, "id"), nested(user, "employeeId")),
 ),
 employeeCode: str(pick(row.employeeCode, row.employee_code, nested(user, "employee_code"), nested(user, "employeeCode")), "—"),
 employeeName: [firstName, lastName].filter(Boolean).join(" ") || "—",
 leaveTypeName: str(pick(row.leaveTypeName, row.leaveType, row.leave_type), "Leave"),
 startDate,
 endDate,
 totalDays: daysBetweenInclusive(startDate, endDate),
 reason: str(pick(row.reason)),
 status: str(pick(row.status), "Pending"),
 appliedOn: str(pick(row.appliedOn, row.applied_date, row.appliedDate)),
 approvedOn: (pick(row.approvedOn, row.approved_date, row.approvedDate) as string | undefined) ?? null,
 approvedById: str(
 pick(row.approvedById, row.approved_by_id, nested(approver, "user_id"), nested(approver, "id")),
 "",
 ) || null,
 approvedByName: approverName,
 };
}
