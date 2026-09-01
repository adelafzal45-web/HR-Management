// Per-(employee, period) manual bonus overrides — the persistence behind the
// Run Payroll grid's editable Bonus column. The configured bonus rule (a
// PayrollRule of rule_type='bonus') computes a bonus for everyone in scope; an
// override here hand-sets one employee's bonus for a single run and the engine
// honors it with precedence over the rule. An amount of 0 cancels the bonus for
// that employee this run (no bonus line); deleting the override reverts to the
// rule value.
//
// Reuses the payroll-run permissions: listing needs `payroll.preview` (the key
// the grid preview already uses); upserting/removing needs `payroll.process`
// (the key that runs the period) — so no new permission keys. Real backend or
// throw — no demo fallback (see payslipsApi.ts); bodies are snake_case to match
// UpsertPayrollBonusOverrideDto.

import { api, ENDPOINTS } from "@/lib/apiClient";

/** One manual bonus override for a run. Mirrors BonusOverrideView. */
export type BonusOverride = {
  bonus_override_id: string;
  user_id: string;
  period_id: string;
  amount: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BonusOverridePayload = {
  user_id: string;
  period_id: string;
  /** Exact bonus for this run; 0 cancels the bonus for this employee. */
  amount: number;
  note?: string;
};

const { bonusOverrides } = ENDPOINTS.payrollEngine;

export const bonusOverridesApi = {
  /** Every manual bonus override for a period, so the grid can pre-fill saved edits. */
  list: (periodId: string): Promise<BonusOverride[]> =>
    api.get<BonusOverride[]>(
      `${bonusOverrides.base}?periodId=${encodeURIComponent(periodId)}`,
    ),

  /** Create or replace the manual bonus for one (employee, period). */
  upsert: (payload: BonusOverridePayload): Promise<BonusOverride> =>
    api.post<BonusOverride>(bonusOverrides.base, payload),

  /** Delete an override, reverting the employee to the configured bonus rule. */
  remove: (id: string): Promise<{ deleted: true }> =>
    api.delete<{ deleted: true }>(bonusOverrides.byId(id)),
};
