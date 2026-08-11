// Payroll rule builder (spec §4–8, §16) — one versioned table carries every
// kind of rule (absence, late, repeated-late, leave, overtime, bonus),
// discriminated by `rule_type` with type-specific settings in `config`. Rules
// are never overwritten: editing an active rule stores a NEW version and
// supersedes the old one, so historical payslips (which snapshot their maths)
// never move. `versions` walks that supersede chain oldest → newest.
//
// Any formula in a config is validated against the SAME safe-evaluator
// whitelist as salary-component formulas (see SalaryComponents) — never
// executed as code. Real backend or throw; bodies are snake_case to match
// CreatePayrollRuleDto.

import { api, ENDPOINTS } from "@/lib/apiClient";
import type { ScopeType } from "./salaryStructuresApi";

export type { ScopeType } from "./salaryStructuresApi";
export { SCOPE_TYPES } from "./salaryStructuresApi";

/** Every rule kind HR can configure. `appraisal` is reserved (no engine read yet). */
export const RULE_TYPES = [
  "absent",
  "late",
  "repeated_late",
  "leave",
  "overtime",
  "bonus",
  "appraisal",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

/** Rule types the engine currently reads. `appraisal` is reserved, not wired. */
export const ACTIVE_RULE_TYPES: readonly RuleType[] = [
  "absent",
  "late",
  "repeated_late",
  "leave",
  "overtime",
  "bonus",
];

export const OVERTIME_APPLIES_TO = ["non_working_day", "govt_holiday"] as const;
export type OvertimeAppliesTo = (typeof OVERTIME_APPLIES_TO)[number];

// ---- Per-type config shapes (mirror payroll-rule.constants.ts) -------------

export type AbsentRuleConfig = {
  mode: "per_day" | "formula";
  multiplier?: number;
  formula?: string;
};

export type LateRuleConfig = {
  grace_minutes: number;
  unit: "per_minute" | "per_incident" | "half_day";
  amount?: number;
  formula?: string;
};

export type RepeatedLateRuleConfig = {
  threshold_count: number;
  penalty_days: number;
};

export type LeaveRuleConfig = {
  unpaid_leave_deduction: "per_day" | "none";
  multiplier?: number;
};

export type OvertimeRuleConfig = {
  enabled: boolean;
  applies_to: OvertimeAppliesTo[];
  rate_multiplier: number;
  formula?: string;
  cap_hours?: number;
};

export type BonusRuleConfig = {
  trigger: "flat" | "percent_gross" | "formula";
  amount?: number;
  formula?: string;
  taxable: boolean;
};

export type RuleConfig = Record<string, unknown>;

/** Mirrors PayrollRule (Backend/src/payroll-rules/payroll-rules.entity.ts). */
export type PayrollRule = {
  rule_id: string;
  rule_type: RuleType;
  name: string;
  scope_type: ScopeType;
  scope_id: string | null;
  config: RuleConfig;
  priority: number;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  version: number;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollRulePayload = {
  rule_type: RuleType;
  name: string;
  scope_type?: ScopeType;
  scope_id?: string | null;
  config: RuleConfig;
  priority?: number;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
};

export type RuleListParams = { rule_type?: RuleType; includeInactive?: boolean };

const { rules } = ENDPOINTS.payrollEngine;

export const payrollRulesApi = {
  list: (params: RuleListParams = {}): Promise<PayrollRule[]> => {
    const query = new URLSearchParams();
    if (params.rule_type) query.set("rule_type", params.rule_type);
    if (params.includeInactive) query.set("includeInactive", "true");
    const qs = query.toString();
    return api.get<PayrollRule[]>(`${rules.base}${qs ? `?${qs}` : ""}`);
  },

  getById: (id: string): Promise<PayrollRule> =>
    api.get<PayrollRule>(rules.byId(id)),

  /** Full version lineage of a rule, oldest → newest (spec §16). */
  versions: (id: string): Promise<PayrollRule[]> =>
    api.get<PayrollRule[]>(rules.versions(id)),

  create: (payload: PayrollRulePayload): Promise<PayrollRule> =>
    api.post<PayrollRule>(rules.base, payload),

  /** Updating an active rule stores a new version and supersedes the old one. */
  update: (
    id: string,
    payload: Partial<PayrollRulePayload>,
  ): Promise<PayrollRule> => api.patch<PayrollRule>(rules.byId(id), payload),

  remove: (id: string): Promise<{ message: string }> =>
    api.delete<{ message: string }>(rules.byId(id)),
};
