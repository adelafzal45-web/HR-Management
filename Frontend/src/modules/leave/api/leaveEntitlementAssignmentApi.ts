// API module for the Admin/HR "Leave Entitlement" assignment workflow:
//   POST /leave-entitlements/preview   -> current balance/used/remaining for a
//                                         resolved target group, before assigning
//   POST /leave-entitlements           -> bulk create/increase/deduct entitlement
//   PATCH /leave-entitlements/:id/adjust -> increase/deduct a single entitlement
//
// Same contract as the rest of the leave API layer (leaveEntitlementsApi.ts,
// holidaysApi.ts): try the real backend first (apiRequest — attaches the JWT),
// and only fall back to a client-synthesized demo dataset when the backend is
// completely unreachable (BackendUnavailableError). Real backend errors — the
// 400 the service throws when the target is ambiguous, the 409-style "would go
// negative" guard, or a 403 from the permission guard — are NEVER swallowed;
// they surface to the page as a plain Error carrying the server message.
//
// A "target" selects exactly one of: single employee, multiple employees, a
// whole department, or a whole designation, with an optional exclude list that
// is applied last against whichever group was resolved. The DTO on the backend
// enforces "exactly one selection"; this adapter mirrors that by only emitting
// the one field that is set.

import { apiRequest, withDemoFallback } from "@/api/client";
import { ENDPOINTS } from "@/app/config/endpoints";
import { employeesApi } from "@/modules/employees/api/employeeApi";

/**
 * `set`      overwrite the yearly entitlement with `days` ("Add entitlement").
 * `increase` add `days` on top of the existing entitlement (positive adjustment).
 * `deduct`   subtract `days` (negative adjustment); refused if it would push the
 *            balance below zero unless `allowNegative` is set.
 */
export type EntitlementMode = "set" | "increase" | "deduct";

/** Exactly one selection field should be set; `excludeUserIds` refines it. */
export type EntitlementTarget = {
  userId?: string;
  userIds?: string[];
  departmentId?: string;
  designationId?: string;
  excludeUserIds?: string[];
};

export type PreviewParams = {
  leaveTypeId: string;
  year: number;
  target: EntitlementTarget;
};

export type BalancePreviewRow = {
  userId: string;
  employeeCode: string;
  name: string;
  department: string | null;
  designation: string | null;
  currentAllocated: number;
  used: number;
  remaining: number;
};

export type AssignPayload = {
  leaveTypeId: string;
  year: number;
  target: EntitlementTarget;
  mode: EntitlementMode;
  days: number;
  allowNegative?: boolean;
  note?: string;
};

export type AssignResultRow = {
  userId: string;
  leaveEntitlementId: string;
  totalDays: number;
};

export type AssignResult = {
  processed: number;
  results: AssignResultRow[];
};

export type AdjustPayload = {
  direction: "increase" | "deduct";
  days: number;
  allowNegative?: boolean;
  note?: string;
};

// ---- Wire shapes ---------------------------------------------------------

type ApiBalancePreview = {
  user_id: string;
  employee_code: string;
  name: string;
  department?: string | null;
  designation?: string | null;
  current_allocated: number;
  used: number;
  remaining: number;
};

type ApiAssignResult = {
  processed: number;
  results: Array<{ user_id: string; leave_entitlement_id: string; total_days: number }>;
};

/**
 * Emit only the one selection field that is set, in the same priority order the
 * backend resolves them (single > list > department > designation), so an
 * accidentally half-filled form can never send an ambiguous target. The
 * exclude list is always allowed alongside whichever selection wins.
 */
function toApiTarget(target: EntitlementTarget): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (target.userId) {
    out.user_id = target.userId;
  } else if (target.userIds && target.userIds.length > 0) {
    out.user_ids = target.userIds;
  } else if (target.departmentId) {
    out.department_id = target.departmentId;
  } else if (target.designationId) {
    out.designation_id = target.designationId;
  }
  if (target.excludeUserIds && target.excludeUserIds.length > 0) {
    out.exclude_user_ids = target.excludeUserIds;
  }
  return out;
}

function adaptPreviewRow(raw: ApiBalancePreview): BalancePreviewRow {
  return {
    userId: raw.user_id,
    employeeCode: raw.employee_code,
    name: raw.name,
    department: raw.department ?? null,
    designation: raw.designation ?? null,
    currentAllocated: Number(raw.current_allocated) || 0,
    used: Number(raw.used) || 0,
    remaining: Number(raw.remaining) || 0,
  };
}

function adaptAssignResult(raw: ApiAssignResult): AssignResult {
  return {
    processed: Number(raw.processed) || 0,
    results: (raw.results ?? []).map((r) => ({
      userId: r.user_id,
      leaveEntitlementId: r.leave_entitlement_id,
      totalDays: Number(r.total_days) || 0,
    })),
  };
}

// ---- Demo fallback -------------------------------------------------------
// Only reached when the backend is unreachable. Resolves the target group from
// whatever employees the demo store has, and synthesizes a deterministic
// balance so the preview table is populated. Assignment in demo mode is a
// no-op that echoes the computed totals back — nothing is persisted.

function seedFor(a: string, b: string): number {
  let hash = 0;
  const s = `${a}:${b}`;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return hash;
}

async function resolveDemoUsers(target: EntitlementTarget) {
  const all = (await employeesApi.list({ pageSize: 1000 })).data;
  const exclude = new Set(target.excludeUserIds ?? []);
  let chosen = all;
  if (target.userId) {
    chosen = all.filter((e) => e.employeeId === target.userId);
  } else if (target.userIds && target.userIds.length > 0) {
    const set = new Set(target.userIds);
    chosen = all.filter((e) => set.has(e.employeeId));
  } else if (target.departmentId) {
    chosen = all.filter((e) => e.departmentId === target.departmentId);
  } else if (target.designationId) {
    chosen = all.filter((e) => e.designationId === target.designationId);
  }
  return chosen.filter((e) => !exclude.has(e.employeeId));
}

async function demoPreview(params: PreviewParams): Promise<BalancePreviewRow[]> {
  const users = await resolveDemoUsers(params.target);
  return users.map((e) => {
    const seed = seedFor(e.employeeId, params.leaveTypeId);
    const allocated = 12 + (seed % 9); // 12–20
    const used = allocated > 0 ? seed % (allocated + 1) : 0;
    return {
      userId: e.employeeId,
      employeeCode: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`.trim(),
      department: e.departmentName,
      designation: e.designationName,
      currentAllocated: allocated,
      used,
      remaining: Math.max(0, allocated - used),
    };
  });
}

async function demoAssign(payload: AssignPayload): Promise<AssignResult> {
  const rows = await demoPreview({
    leaveTypeId: payload.leaveTypeId,
    year: payload.year,
    target: payload.target,
  });
  const results: AssignResultRow[] = rows.map((r, i) => {
    const total =
      payload.mode === "set"
        ? payload.days
        : payload.mode === "increase"
          ? r.currentAllocated + payload.days
          : r.currentAllocated - payload.days;
    return {
      userId: r.userId,
      leaveEntitlementId: `demo-ent-${i}`,
      totalDays: payload.allowNegative ? total : Math.max(0, total),
    };
  });
  return { processed: results.length, results };
}

export const leaveEntitlementAssignmentApi = {
  /** Resolve the target group and return current balances before assigning. */
  preview: (params: PreviewParams) =>
    withDemoFallback<BalancePreviewRow[]>(
      async () => {
        const raw = await apiRequest<ApiBalancePreview[]>(ENDPOINTS.leaveEntitlements.preview, {
          method: "POST",
          body: {
            leave_type_id: params.leaveTypeId,
            year: params.year,
            target: toApiTarget(params.target),
          },
        });
        return (Array.isArray(raw) ? raw : []).map(adaptPreviewRow);
      },
      async () => demoPreview(params),
    ),

  /** Bulk create / increase / deduct a yearly entitlement across the target. */
  assign: (payload: AssignPayload) =>
    withDemoFallback<AssignResult>(
      async () => {
        const raw = await apiRequest<ApiAssignResult>(ENDPOINTS.leaveEntitlements.base, {
          method: "POST",
          body: {
            leave_type_id: payload.leaveTypeId,
            year: payload.year,
            target: toApiTarget(payload.target),
            mode: payload.mode,
            days: payload.days,
            allow_negative: payload.allowNegative ?? false,
            note: payload.note,
          },
        });
        return adaptAssignResult(raw);
      },
      async () => demoAssign(payload),
    ),

  /** Increase or deduct balance on a single existing entitlement. */
  adjust: (entitlementId: string, payload: AdjustPayload) =>
    apiRequest<unknown>(ENDPOINTS.leaveEntitlements.adjust(entitlementId), {
      method: "PATCH",
      body: {
        direction: payload.direction,
        days: payload.days,
        allow_negative: payload.allowNegative ?? false,
        note: payload.note,
      },
    }),
};
