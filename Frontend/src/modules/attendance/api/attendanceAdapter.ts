// Shared adapter for `GET /attendance` rows from the live backend.
//
// Confirmed shape (see the live Swagger sample response for GET /attendance):
// {
// attendance_id, attendance_date, check_in, check_out,
// working_hours: "7.76", // numeric string
// overtime_hours: "0.00", // numeric string
// is_overtime: boolean,
// attendance_status: "Present" | "Late" | "Absent" | "Half-Day" | "On Leave",
// user: { user_id, employee_code, first_name, last_name, ... },
// shift: { shift_id, shift_name, start_time, end_time, ... } | null,
// }
//
// The employee/shift identifiers are nested under `user` / `shift`, not
// flat `employee_id` / `shift_id` columns on the row itself — code that
// assumed flat columns (the previous `hrApi.ts`/`adminOpsApi.ts`) silently
// produced `undefined` for every employee/shift field, which is why
// Attendance/Attendance Records/Team views weren't showing real data.
//
// Used by both the employee self-service module (hrApi.ts) and the
// HR/Administrator org-wide module (adminOpsApi.ts) so the two stay in sync.

const str = (v: unknown, fallback = ""): string =>
 typeof v === "string" ? v : v == null ? fallback : String(v);

const numOrNull = (v: unknown): number | null => {
 if (v === null || v === undefined || v === "") return null;
 const n = typeof v === "number" ? v : Number(v);
 return Number.isFinite(n) ? n : null;
};

const nested = (v: unknown, key: string): unknown =>
 v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;

const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && v !== "");

// Live rows come back as "HH:mm:ss" — trim to "HH:mm" for display/inputs.
const trimTime = (v: unknown): string | null => {
 const s = pick(v);
 if (typeof s !== "string" || !s) return null;
 return s.length >= 5 ? s.slice(0, 5) : s;
};

export type ParsedAttendanceRow = {
 attendanceId: string;
 employeeId: string;
 employeeCode: string;
 employeeName: string;
 shiftId: string;
 shiftName: string;
 attendanceDate: string;
 checkIn: string | null;
 checkOut: string | null;
 workingHours: number | null;
 overtimeHours: number | null;
 isOvertime: boolean;
 status: string;
};

export function parseAttendanceRow(row: Record<string, unknown>): ParsedAttendanceRow {
 const user = row.user as Record<string, unknown> | undefined;
 const shift = row.shift as Record<string, unknown> | undefined;

 const firstName = str(pick(row.firstName, nested(user, "first_name"), nested(user, "firstName")));
 const lastName = str(pick(row.lastName, nested(user, "last_name"), nested(user, "lastName")));
 const isOvertimeRaw = pick(row.isOvertime, row.is_overtime);

 return {
 attendanceId: str(pick(row.attendanceId, row.attendance_id, row.id)),
 employeeId: str(
 pick(row.employeeId, row.employee_id, row.user_id, nested(user, "user_id"), nested(user, "id"), nested(user, "employeeId")),
 ),
 employeeCode: str(pick(row.employeeCode, row.employee_code, nested(user, "employee_code"), nested(user, "employeeCode")), "—"),
 employeeName: [firstName, lastName].filter(Boolean).join(" ") || "—",
 shiftId: str(pick(row.shiftId, row.shift_id, nested(shift, "shift_id"), nested(shift, "id"))),
 shiftName: str(pick(row.shiftName, row.shift_name, nested(shift, "shift_name"), nested(shift, "name")), "—"),
 attendanceDate: str(pick(row.attendanceDate, row.attendance_date)),
 checkIn: trimTime(pick(row.checkIn, row.check_in)),
 checkOut: trimTime(pick(row.checkOut, row.check_out)),
 workingHours: numOrNull(pick(row.workingHours, row.working_hours)),
 overtimeHours: numOrNull(pick(row.overtimeHours, row.overtime_hours)),
 isOvertime: isOvertimeRaw === true || isOvertimeRaw === "true",
 status: str(pick(row.attendanceStatus, row.attendance_status, row.status), "Present"),
 };
}

// Working/overtime hours aren't computed server-side (the live data shows
// `working_hours` unrelated to the actual check-in/out gap), so callers
// that write check-in/out times compute these client-side to keep the UI
// consistent.
export function computeHours(checkIn: string, checkOut: string, standardHours = 8) {
 const [inH, inM] = checkIn.split(":").map(Number);
 const [outH, outM] = checkOut.split(":").map(Number);
 const minutes = outH * 60 + outM - (inH * 60 + inM);
 const workingHours = Math.max(0, Math.round((minutes / 60) * 100) / 100);
 const overtimeHours = Math.round(Math.max(0, workingHours - standardHours) * 100) / 100;
 return { workingHours, overtimeHours, isOvertime: overtimeHours > 0 };
}
