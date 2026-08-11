/**
 * Shared vocabulary for the payroll engine.
 *
 * Kept in one place so the entities, DTOs, and the calculation service agree on
 * the exact string values that also live in the DB CHECK constraints created by
 * the schema migration. Changing a value here means changing the constraint.
 */

/** A salary component either adds to pay (earning) or subtracts from it (deduction). */
export const COMPONENT_TYPES = ['earning', 'deduction'] as const;
export type ComponentType = (typeof COMPONENT_TYPES)[number];

/**
 * How a component's amount is derived.
 *   fixed          — a flat `amount`
 *   percent_basic  — `amount` percent of BASIC
 *   percent_gross  — `amount` percent of GROSS
 *   per_day        — `amount` per present/working day
 *   per_hour       — `amount` per hour (e.g. overtime rate)
 *   formula        — the safe formula evaluator over approved variables
 */
export const CALCULATION_TYPES = [
  'fixed',
  'percent_basic',
  'percent_gross',
  'per_day',
  'per_hour',
  'formula',
] as const;
export type CalculationType = (typeof CALCULATION_TYPES)[number];

/**
 * The scope a salary structure assignment targets, in ascending priority.
 * Higher priority wins when several assignments match one employee on a date.
 */
export const SCOPE_TYPES = [
  'company',
  'job_category',
  'department',
  'designation',
  'employee',
] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

/** Priority of each scope — larger number wins. */
export const SCOPE_PRIORITY: Record<ScopeType, number> = {
  company: 1,
  job_category: 2,
  department: 3,
  designation: 4,
  employee: 5,
};

/**
 * Payroll period lifecycle.
 *   draft            — created, nothing calculated
 *   processing       — a run is generating payslips
 *   pending_approval — processed, waiting on an Administrator (approval_enabled)
 *   approved         — approved (or auto-approved when approval is off)
 *   locked           — frozen against edits
 *   paid             — marked paid
 */
export const PERIOD_STATUSES = [
  'draft',
  'processing',
  'pending_approval',
  'approved',
  'locked',
  'paid',
] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

export const PAYSLIP_STATUSES = [
  'draft',
  'generated',
  'approved',
  'locked',
  'paid',
] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];
