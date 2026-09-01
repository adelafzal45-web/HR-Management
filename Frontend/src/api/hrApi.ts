// API modules for the Phase 1 employee self-service screens:
// Attendance, Leave, Notifications.
//
// Appraisal is NOT here — it has its own real backend facade in
// modules/appraisal/api/appraisalApi.ts. Payroll self-service also moved out:
// payslips are served by the real /payslips/me route (see
// modules/payroll/api/payslipsApi.ts), so the old flat-`payroll`-table facade
// that used to live here was dead code and has been removed.
//
// Every call talks to the real NestJS backend through the shared transport in
// lib/apiClient (JWT bearer, httpOnly refresh cookie, single-flight 401
// refresh-and-replay, request timeout). There is NO demo/mock fallback: a
// backend error (validation, insufficient leave balance, 401/403, network
// failure) surfaces to the caller as an `ApiError` rather than being swallowed
// into fabricated data. Screens render the error state instead.
//
// Two tables (`Attendance`, `LeaveRequests`) also expose dedicated
// token-scoped self-service routes (`/attendance/me/*`, `/attendance/check-*`,
// `/leave-requests/me`) that the generic CRUD controllers don't — those need
// only a valid token and scope themselves to that token's employee, which is
// why the self-service surface below targets them rather than the org-wide
// `/attendance` / `/leave-requests` lists (which require view permissions the
// Employee role doesn't hold).

import { apiRequest, apiUpload, ENDPOINTS } from "@/lib/apiClient";
import { parseAttendanceRow } from "@/modules/attendance/api/attendanceAdapter";
import { parseLeaveRow } from "@/modules/leave/api/leaveAdapter";
import { leaveTypesApi, resolveUploadUrl, type LeaveType } from "@/modules/settings/api/settingsApi";

// ---------------------------------------------------------------------------
// Shared coercion helpers
// ---------------------------------------------------------------------------

// numeric columns come back from pg as strings ("12.00"), so coerce loosely.
const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// Backend list routes return either a bare array or the `{ data }` list
// envelope used elsewhere in this app (see settingsApi.ts / employeeApi.ts) —
// normalize both to an array of raw rows for the adapters.
function toRows<T = Record<string, unknown>>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const data = (res as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

// ---------------------------------------------------------------------------
// Attendance (maps to the `Attendance` table)
// ---------------------------------------------------------------------------
// "Half-Day" / "On Leave" are the extra values the live backend actually
// sends on `attendance_status`, alongside the original set.
export type AttendanceStatus = "Present" | "Late" | "Absent" | "Leave" | "Holiday" | "Half-Day" | "On Leave";

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

// Adapts one row from `GET /attendance` to the frontend's AttendanceRecord
// shape. The live rows nest the employee under `user` and the shift under
// `shift` rather than exposing flat `employee_id`/`shift_id` columns, and
// `working_hours`/`overtime_hours` arrive as numeric strings — see
// attendanceAdapter.ts (shared with the org-wide admin module) for the shape.
function adaptAttendanceRow(row: Record<string, unknown>): AttendanceRecord {
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
  // Company-wide policy in force. In 'Device' mode self check-in/out is disabled
  // (the terminal records attendance): both can* flags above are false and
  // `selfServiceDisabledReason` carries the server's verbatim explanation for
  // the banner. In 'Manual' mode the reason is null and the buttons work.
  attendanceMode: "Device" | "Manual";
  selfServiceDisabledReason: string | null;
  attendance: AttendanceRecord | null;
  shiftName: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
};

// Raw wire shape of `GET /attendance/me/today`.
type RawTodayStatus = {
  date?: string;
  is_working_day?: boolean;
  can_check_in?: boolean;
  can_check_out?: boolean;
  attendance_mode?: string;
  self_service_disabled_reason?: string | null;
  attendance?: Record<string, unknown> | null;
  shift?: { shift_name?: string | null; start_time?: string | null; end_time?: string | null } | null;
};

function adaptTodayStatus(res: RawTodayStatus): TodayAttendance {
  const shift = res.shift ?? null;
  return {
    date: String(res.date ?? new Date().toISOString().slice(0, 10)),
    isWorkingDay: res.is_working_day !== false,
    canCheckIn: res.can_check_in === true,
    canCheckOut: res.can_check_out === true,
    // Default to Manual (buttons enabled) when the field is absent, so an older
    // backend that predates the mode switch never strands the self-service UI.
    attendanceMode: res.attendance_mode === "Device" ? "Device" : "Manual",
    selfServiceDisabledReason: res.self_service_disabled_reason ?? null,
    attendance: res.attendance ? adaptAttendanceRow(res.attendance) : null,
    shiftName: shift?.shift_name ?? null,
    shiftStart: shift?.start_time ? String(shift.start_time).slice(0, 5) : null,
    shiftEnd: shift?.end_time ? String(shift.end_time).slice(0, 5) : null,
  };
}

// ---- Attendance ------------------------------------------------------------
// The four self-service calls below hit dedicated routes rather than the
// generic CRUD table. That is not cosmetic: `POST /attendance` needs
// `attendance.create` and `GET /attendance` needs `attendance.view`, neither of
// which the Employee role holds. The `/attendance/me/*` and `/attendance/check-*`
// routes need only a valid token and scope themselves to that token's employee.
//
// They also move four decisions server-side that the browser had no business
// making: the clock, the employee (`user_id` used to be caller-supplied), Late
// vs Present (the employee's own shift start plus its grace period), and
// working/overtime hours (were computed client-side and submitted, i.e.
// trivially forgeable).
export const attendanceApi = {
  // Returns the whole status object, not just the row: the buttons need
  // `canCheckIn`/`canCheckOut` from the server, which guards edge cases the
  // stamps alone can't (a row created by an absence sweep, an account
  // deactivated mid-day, a second tab that already checked in).
  getToday: async (): Promise<TodayAttendance> =>
    adaptTodayStatus(await apiRequest<RawTodayStatus>(ENDPOINTS.attendance.me.today)),

  checkIn: async (): Promise<AttendanceRecord> =>
    adaptAttendanceRow(await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.me.checkIn, { method: "POST" })),

  checkOut: async (): Promise<AttendanceRecord> =>
    adaptAttendanceRow(await apiRequest<Record<string, unknown>>(ENDPOINTS.attendance.me.checkOut, { method: "POST" })),

  // Narrowed server-side by employee and month, so this no longer pulls the
  // entire organisation's attendance down to filter it in the browser.
  getHistory: async (params: { month: number; year: number }): Promise<AttendanceRecord[]> => {
    const res = await apiRequest<unknown>(
      `${ENDPOINTS.attendance.me.history}?month=${params.month}&year=${params.year}`,
    );
    return toRows(res).map(adaptAttendanceRow);
  },
};

// ---------------------------------------------------------------------------
// Leave (maps to `LeaveType` and `LeaveRequests` tables)
// ---------------------------------------------------------------------------
export type LeaveStatus = "Pending" | "Approved" | "Rejected";

export type LeaveRequest = {
  leaveId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  /** "Full Day" | "First Half" | "Second Half" | "Multiple Days". */
  durationType: string;
  reason: string;
  status: LeaveStatus;
  appliedOn: string;
  approvedOn: string | null;
  approvedBy: string | null;
  remarks: string | null;
};

// Adapts one row from `GET /leave-requests/me` to the frontend's LeaveRequest
// shape. `leaveTypeId` comes from the real `leave_type_id` FK the backend
// supplies (it's what balance deduction keys off).
function adaptLeaveRow(row: Record<string, unknown>): LeaveRequest {
  const parsed = parseLeaveRow(row);
  const leaveTypeRef = row.leaveTypeRef as { leave_type_id?: string } | undefined;
  const realTypeId =
    (row.leave_type_id as string | undefined) ??
    (row.leaveTypeId as string | undefined) ??
    leaveTypeRef?.leave_type_id;
  return {
    leaveId: parsed.leaveId,
    employeeId: parsed.employeeId,
    // Left empty for legacy rows written before the `leave_type_id` column
    // existed — we never invent an id the backend wouldn't recognise.
    leaveTypeId: realTypeId ?? "",
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

/** Wire shape of a ledger entry from `GET /leave-entitlements/me/history`. */
type RawHistoryEntry = {
  leave_history_id?: string | number;
  leaveType?: { name?: string } | null;
  leave_type_name?: string;
  year?: number | string;
  type?: string;
  amount?: number | string;
  balance_after?: number | string;
  note?: string | null;
  created_at?: string;
  createdAt?: string;
  performedBy?: { first_name?: string; last_name?: string } | null;
  performed_by?: { first_name?: string; last_name?: string } | null;
};

function adaptHistoryEntry(row: RawHistoryEntry): MyLeaveHistoryEntry {
  const performedBy = row.performedBy ?? row.performed_by ?? null;
  const performedByName = performedBy
    ? `${String(performedBy.first_name ?? "")} ${String(performedBy.last_name ?? "")}`.trim() || null
    : null;
  return {
    historyId: String(row.leave_history_id ?? ""),
    leaveTypeName: String(row.leaveType?.name ?? row.leave_type_name ?? "Leave"),
    year: toNum(row.year) || new Date().getFullYear(),
    type: String(row.type ?? "Adjustment"),
    amount: toNum(row.amount),
    balanceAfter: toNum(row.balance_after),
    note: row.note ?? null,
    performedByName,
    createdAt: String(row.created_at ?? row.createdAt ?? new Date().toISOString()),
  };
}

// ---- Leave — self-service at /leave-requests/me -----------------------------
export const leaveApi = {
  // Real catalog from `GET /leave-types` (active types only). The UUIDs it
  // returns are what `leave_type_id` must carry for the backend to deduct
  // balance on approval. Delegated to the settings module, which owns
  // leave-type CRUD and the canonical `LeaveType` shape.
  getLeaveTypes: (): Promise<LeaveType[]> => leaveTypesApi.listAll(),

  // Real balances from the token-scoped /leave-entitlements/me/balances route:
  // no permission beyond a valid JWT, identity comes from the token.
  getBalance: async (): Promise<MyLeaveBalance[]> => {
    const res = await apiRequest<unknown>(ENDPOINTS.leaveEntitlements.me.balances);
    return toRows<MyBalanceRow>(res).map(adaptBalanceRow);
  },

  // The real entitlement ledger (Entitlement / Adjustment / Leave Taken /
  // Carry Forward / Expiry), token-scoped to the signed-in employee — this is
  // the "Leave History" the balance numbers actually come from, as opposed to
  // the request list below.
  getMyHistory: async (params?: { year?: number; type?: string }): Promise<MyLeaveHistoryEntry[]> => {
    const qs = new URLSearchParams();
    if (params?.year) qs.set("year", String(params.year));
    if (params?.type) qs.set("type", params.type);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    const res = await apiRequest<unknown>(`${ENDPOINTS.leaveEntitlements.me.history}${suffix}`);
    return toRows<RawHistoryEntry>(res).map(adaptHistoryEntry);
  },

  // Scoped server-side to the token's employee, so this no longer pulls the
  // whole organisation's leave down to filter it in the browser.
  getMyLeaves: async (): Promise<LeaveRequest[]> => {
    const res = await apiRequest<unknown>(ENDPOINTS.leaveRequests.me);
    return toRows(res)
      .map(adaptLeaveRow)
      .sort((a, b) => (a.appliedOn < b.appliedOn ? 1 : -1));
  },

  // POSTs to the token-scoped route: `user_id` is taken from the JWT and the
  // status is forced to Pending server-side, so neither is sent here.
  // `is_half_day` and `days_count` are derived by the backend from
  // `duration_type` — sending them would only risk disagreeing with it.
  applyLeave: async (payload: ApplyLeavePayload): Promise<LeaveRequest> => {
    const created = await apiRequest<Record<string, unknown>>(ENDPOINTS.leaveRequests.me, {
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
};

// ---- Notifications — live REST CRUD at /notifications ---------------------
// A composed notification is fanned out server-side: one row per resolved
// recipient, grouped by `batch_id`. That shape drives everything here.
//
//   POST /notifications          { title, message, category, audience_type,
//                                  audience_department_id?, recipient_ids? }
//                                The author comes from the JWT — it is NOT a
//                                body field, because the recipient sees
//                                "from <name>" and a client-supplied sender is
//                                forgeable.
//   GET  /notifications          the sender's Sent view: one entry per send,
//                                with recipient_count / read_count. Gated on
//                                `notifications.view` (HR/Admin).
//   GET  /notifications/me       the signed-in user's bell: { data, unread }.
//                                Open to every authenticated user.
//   PATCH /notifications/me/:id/read , POST /notifications/me/read-all
//                                per-user read state, persisted server-side.
//
// `category` is the backend column name; the frontend type is called `type`,
// so the adapter maps between them. Rows written before targeting landed have
// no batch or audience, hence the optional fields.
export type NotificationType = "Leave" | "Payroll" | "Attendance" | "Appraisal" | "Announcement" | "General";

/** How the sender chose the recipients. Mirrors the backend enum. */
export type NotificationAudienceType = "Specific" | "Department" | "All";

// A notification is delivered as one row per recipient, so `isRead` is a real
// server column (`read_at`) owned by the signed-in user — not a client-side
// guess. The `audience*` and `*Count` fields are only populated on the sender's
// Sent view, where the rows of one send are grouped into a single entry.
export type NotificationRecord = {
  notificationId: string;
  title: string;
  message: string;
  type: NotificationType;
  isRead: boolean;
  createdAt: string;
  createdById?: string;
  createdByName?: string;
  /** Groups the rows written by one send. Absent on pre-targeting rows. */
  batchId?: string;
  audienceType?: NotificationAudienceType;
  audienceDepartmentId?: string;
  audienceDepartmentName?: string;
  recipientCount?: number;
  readCount?: number;
  /**
   * An optional document or image sent with the notification. The filename is
   * carried separately from the URL because the stored file is named by UUID —
   * without it a download would save as `9f3c…-ab12.pdf`.
   */
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentSize?: number;
};

// Raw wire shape of a notification row, accepting both the snake_case columns
// the Sent-view aggregate returns and the camelCase nesting single-row
// responses use.
type RawNotificationRow = {
  notification_id?: string | number;
  notificationId?: string | number;
  id?: string | number;
  title?: string;
  message?: string;
  category?: string;
  type?: string;
  read_at?: string | null;
  readAt?: string | null;
  created_at?: string;
  createdAt?: string;
  createdBy?: { user_id?: string; first_name?: string; last_name?: string } | null;
  created_by_id?: string;
  created_by_name?: string;
  batch_id?: string;
  batchId?: string;
  audience_type?: NotificationAudienceType;
  audienceType?: NotificationAudienceType;
  audience_department_id?: string;
  audienceDepartmentId?: string;
  audience_department_name?: string;
  audienceDepartmentName?: string;
  recipient_count?: number | string;
  recipientCount?: number | string;
  read_count?: number | string;
  readCount?: number | string;
  attachment_url?: string;
  attachmentUrl?: string;
  attachment_name?: string;
  attachmentName?: string;
  attachment_mime?: string;
  attachmentMime?: string;
  attachment_size?: number | string;
  attachmentSize?: number | string;
};

function adaptNotificationRow(row: RawNotificationRow): NotificationRecord {
  const createdBy = row.createdBy ?? null;
  const nestedName = createdBy
    ? `${createdBy.first_name ?? ""} ${createdBy.last_name ?? ""}`.trim()
    : "";
  // The Sent view is a grouped aggregate, so it returns flat `created_by_*`
  // columns; single-row responses nest the whole user under `createdBy`.
  const createdByName = nestedName || row.created_by_name || undefined;

  const recipientCount = row.recipient_count ?? row.recipientCount;
  const readCount = row.read_count ?? row.readCount;
  const attachmentSize = row.attachment_size ?? row.attachmentSize;
  const attachmentUrl = row.attachment_url ?? row.attachmentUrl;

  return {
    notificationId: String(row.notification_id ?? row.notificationId ?? row.id ?? ""),
    title: row.title ?? "",
    message: row.message ?? "",
    type: (row.category ?? row.type ?? "General") as NotificationType,
    // Server-owned now: each recipient has their own row, so `read_at` is
    // genuinely this user's read state rather than a shared flag.
    isRead: Boolean(row.read_at ?? row.readAt),
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    createdById: createdBy?.user_id ?? row.created_by_id ?? undefined,
    createdByName: createdByName || undefined,
    batchId: row.batch_id ?? row.batchId ?? undefined,
    audienceType: row.audience_type ?? row.audienceType ?? undefined,
    audienceDepartmentId: row.audience_department_id ?? row.audienceDepartmentId ?? undefined,
    audienceDepartmentName: row.audience_department_name ?? row.audienceDepartmentName ?? undefined,
    recipientCount: recipientCount == null ? undefined : Number(recipientCount),
    readCount: readCount == null ? undefined : Number(readCount),
    // Resolved to an absolute URL here so every consumer gets something it can
    // put straight in an `href`. The column holds a server-relative path, which
    // would 404 against the Vite dev-server origin.
    attachmentUrl: attachmentUrl ? resolveUploadUrl(attachmentUrl) : undefined,
    attachmentName: row.attachment_name ?? row.attachmentName ?? undefined,
    attachmentMime: row.attachment_mime ?? row.attachmentMime ?? undefined,
    attachmentSize: attachmentSize == null ? undefined : Number(attachmentSize),
  };
}

/** What the compose form sends. Mirrors `CreateNotificationDto`. */
export type SendNotificationPayload = {
  title: string;
  message: string;
  type: NotificationType;
  audienceType: NotificationAudienceType;
  /** Required when audienceType is "Department". */
  audienceDepartmentId?: string;
  /** Required when audienceType is "Specific". */
  recipientIds?: string[];
  /** Optional document, as returned by `uploadAttachment`. */
  attachment?: NotificationAttachment;
};

/** The metadata `POST /notifications/attachment` hands back after storing a file. */
export type NotificationAttachment = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

export const notificationApi = {
  /**
   * Store a file and get back the metadata to send with the notification.
   *
   * Deliberately not folded into `create`: the file is validated (size, and real
   * magic bytes rather than the claimed mimetype) before the sender has chosen
   * an audience, so a rejected PDF costs one error message instead of a failed
   * send.
   */
  uploadAttachment: async (file: File): Promise<NotificationAttachment> => {
    const form = new FormData();
    form.append("file", file);
    const raw = await apiUpload<{ url?: string; name?: string; mime?: string; size?: number }>(
      ENDPOINTS.notifications.attachment,
      form,
    );
    return {
      url: String(raw?.url ?? ""),
      name: String(raw?.name ?? file.name),
      mime: String(raw?.mime ?? file.type),
      size: Number(raw?.size ?? file.size),
    };
  },

  /** The sender's Sent view — grouped batches, not one row per recipient. */
  getAll: async (): Promise<NotificationRecord[]> => {
    const res = await apiRequest<unknown>(ENDPOINTS.notifications.base);
    return toRows<RawNotificationRow>(res)
      .map(adaptNotificationRow)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  /**
   * The signed-in user's bell. Distinct from `getAll` in both scope and
   * permission: this returns only what was addressed to *them*, and does not
   * require `notifications.view`.
   */
  getMine: async (
    options: { unreadOnly?: boolean; limit?: number } = {},
  ): Promise<{ data: NotificationRecord[]; unread: number }> => {
    const params = new URLSearchParams();
    if (options.unreadOnly) params.set("unread", "true");
    if (options.limit) params.set("limit", String(options.limit));
    const query = params.toString();

    const res = await apiRequest<unknown>(
      query ? `${ENDPOINTS.notifications.me}?${query}` : ENDPOINTS.notifications.me,
    );
    const envelope = (res && typeof res === "object" && !Array.isArray(res) ? res : {}) as { unread?: number };
    return {
      data: toRows<RawNotificationRow>(res).map(adaptNotificationRow),
      unread: Number(envelope.unread ?? 0),
    };
  },

  markRead: async (notificationId: string): Promise<NotificationRecord> =>
    adaptNotificationRow(
      await apiRequest<RawNotificationRow>(ENDPOINTS.notifications.markRead(notificationId), { method: "PATCH" }),
    ),

  markAllRead: (): Promise<{ updated: number }> =>
    apiRequest<{ updated: number }>(ENDPOINTS.notifications.markAllRead, { method: "POST" }),

  /**
   * Send to everyone, one department, or a chosen set of employees. The
   * response is the batch summary, so `recipientCount` tells the sender how
   * many people it actually reached.
   */
  create: async (payload: SendNotificationPayload): Promise<NotificationRecord> => {
    const created = await apiRequest<RawNotificationRow>(ENDPOINTS.notifications.base, {
      method: "POST",
      body: {
        title: payload.title,
        message: payload.message,
        category: payload.type,
        audience_type: payload.audienceType,
        // Sent only for the audience that uses them: the DTO validates these
        // conditionally, and a stray department id on an "All" send would be
        // recorded as if it had been targeted.
        ...(payload.audienceType === "Department"
          ? { audience_department_id: payload.audienceDepartmentId }
          : {}),
        ...(payload.audienceType === "Specific"
          ? { recipient_ids: payload.recipientIds ?? [] }
          : {}),
        // All four together or none at all. The backend checks the URL names a
        // file it issued, so a half-populated attachment would be rejected
        // rather than stored as a broken link.
        ...(payload.attachment
          ? {
              attachment_url: payload.attachment.url,
              attachment_name: payload.attachment.name,
              attachment_mime: payload.attachment.mime,
              attachment_size: payload.attachment.size,
            }
          : {}),
      },
    });
    return adaptNotificationRow(created);
  },

  /** Applies to every recipient's copy — the batch, not one person's row. */
  update: async (
    notificationId: string,
    payload: { title: string; message: string; type: NotificationType },
  ): Promise<NotificationRecord> => {
    const updated = await apiRequest<RawNotificationRow>(ENDPOINTS.notifications.byId(notificationId), {
      method: "PATCH",
      body: {
        title: payload.title,
        message: payload.message,
        category: payload.type,
      },
    });
    return adaptNotificationRow(updated);
  },

  /** Removes it from every recipient's bell, not just the row named by the id. */
  remove: async (notificationId: string): Promise<{ notificationId: string }> => {
    await apiRequest(ENDPOINTS.notifications.byId(notificationId), { method: "DELETE" });
    return { notificationId };
  },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export type { LeaveType };
