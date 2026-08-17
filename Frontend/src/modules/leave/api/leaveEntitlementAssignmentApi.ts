// API module for the Admin/HR "Leave Entitlement" assignment workflow:
//   POST /leave-entitlements/preview   -> current balance/used/remaining for a
//                                         resolved target group, before assigning
//   POST /leave-entitlements           -> bulk create/increase/deduct entitlement
//   PATCH /leave-entitlements/:id/adjust -> increase/deduct a single entitlement
//
// Same contract as the rest of the leave API layer (leaveEntitlementsApi.ts,
// holidaysApi.ts): talks to the real backend through the shared transport in
// lib/apiClient (attaches the JWT). There is NO demo/mock fallback — real
// backend errors (the 400 the service throws when the target is ambiguous, the
// "would go negative" guard, or a 403 from the permission guard) are NEVER
// swallowed; they surface to the page as an `ApiError`.
//
// A "target" selects exactly one of: single employee, multiple employees, a
// whole department, or a whole designation, with an optional exclude list that
// is applied last against whichever group was resolved. The DTO on the backend
// enforces "exactly one selection"; this adapter mirrors that by only emitting
// the one field that is set.

import { apiRequest, ENDPOINTS } from "@/lib/apiClient";

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

export const leaveEntitlementAssignmentApi = {
  /** Resolve the target group and return current balances before assigning. */
  preview: async (params: PreviewParams): Promise<BalancePreviewRow[]> => {
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

  /** Bulk create / increase / deduct a yearly entitlement across the target. */
  assign: async (payload: AssignPayload): Promise<AssignResult> => {
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
