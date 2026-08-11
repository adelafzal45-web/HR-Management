/**
 * Shared vocabulary and config shapes for the payroll rule builder (spec §4–8).
 *
 * A single `payroll_rules` table carries every kind of rule, discriminated by
 * `rule_type`, with the type-specific settings held in a `config` jsonb blob.
 * The shapes below are the contract between the builder UI, the create/update
 * validator (`PayrollRulesService.assertConfigValid`), and the resolver the
 * engine consumes. Any formula embedded in a config is validated against the
 * same safe evaluator whitelist as salary-component formulas — never executed
 * as code.
 *
 * String values here also back the DB CHECK constraints created by the Phase 2
 * schema migration; changing a value means changing the constraint.
 */

/**
 * The kinds of rule HR can configure.
 *   absent        — how unpaid days are deducted (§4)
 *   late          — penalty for arriving late (§5)
 *   repeated_late — N late arrivals convert to a deducted day (§5)
 *   leave         — how unpaid leave affects pay (§6)
 *   overtime      — overtime pay; OFF by default, non-working/holiday only (§7)
 *   bonus         — one-off or recurring bonus/incentive (§8)
 *   appraisal     — reserved for appraisal-driven pay; no engine read yet
 */
export const RULE_TYPES = [
  'absent',
  'late',
  'repeated_late',
  'leave',
  'overtime',
  'bonus',
  'appraisal',
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

/** Rule types the engine currently reads. `appraisal` is reserved, not wired. */
export const ACTIVE_RULE_TYPES: readonly RuleType[] = [
  'absent',
  'late',
  'repeated_late',
  'leave',
  'overtime',
  'bonus',
];

// ---- Per-type config shapes -------------------------------------------------

/** A deduction amount expressed either as a per-day multiple or a formula. */
export interface DeductionExpr {
  mode: 'per_day' | 'formula';
  /** per_day: multiple of the basic daily rate (1 = a full day's pay). */
  multiplier?: number;
  /** formula: safe-evaluator expression over the approved variables. */
  formula?: string;
}

export interface AbsentRuleConfig extends DeductionExpr {}

export interface LateRuleConfig {
  /** Minutes of lateness forgiven before any penalty applies. */
  grace_minutes: number;
  unit: 'per_minute' | 'per_incident' | 'half_day';
  /** Money per minute / per incident; ignored for half_day (uses daily rate). */
  amount?: number;
  /** Optional formula override (LATE_MINUTES, DAILY_RATE, … in scope). */
  formula?: string;
}

export interface RepeatedLateRuleConfig {
  /** Number of late arrivals that convert to one deducted day. */
  threshold_count: number;
  /** Days deducted each time the threshold is reached. */
  penalty_days: number;
}

export interface LeaveRuleConfig {
  /** How an unpaid-leave day is charged. `none` leaves it to base pay. */
  unpaid_leave_deduction: 'per_day' | 'none';
  /** per_day: multiple of the basic daily rate (default 1). */
  multiplier?: number;
}

export const OVERTIME_APPLIES_TO = [
  'non_working_day',
  'govt_holiday',
] as const;
export type OvertimeAppliesTo = (typeof OVERTIME_APPLIES_TO)[number];

export interface OvertimeRuleConfig {
  /** Master switch. Default OFF per spec: OT is opt-in. */
  enabled: boolean;
  /** When enabled, OT is only paid on these day kinds. */
  applies_to: OvertimeAppliesTo[];
  /** Multiple of the hourly rate paid per OT hour (e.g. 2 = double time). */
  rate_multiplier: number;
  /** Optional formula override (OT_HOURS, HOURLY_RATE, … in scope). */
  formula?: string;
  /** Cap on paid OT hours per period; 0/absent = uncapped. */
  cap_hours?: number;
}

export interface BonusRuleConfig {
  trigger: 'flat' | 'percent_gross' | 'formula';
  /** flat: money; percent_gross: percentage of GROSS. */
  amount?: number;
  /** formula: safe-evaluator expression (BONUS-eligible earnings in scope). */
  formula?: string;
  /** Whether the bonus adds to taxable income. */
  taxable: boolean;
}
