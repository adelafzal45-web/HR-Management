/**
 * The pure, dependency-free core of the payroll engine (spec §11/§14).
 *
 * Everything here is a plain function over plain data: given a BASIC figure, a
 * resolved list of components, the period's attendance/leave inputs, and the
 * handful of relevant settings, it produces the full payslip breakdown — every
 * line, each with a human-readable "Why?" note, plus the headline totals.
 *
 * It is deliberately separated from `PayrollCalculationService` (which owns the
 * database work of resolving structures, gathering attendance, and persisting)
 * so the arithmetic can be unit-tested in isolation with no repositories to
 * mock. The service resolves rows into `ComputeComponent`s and hands them here.
 *
 * Scope variables fed to component formulas are exactly the whitelist the safe
 * evaluator enforces (see PAYROLL_VARIABLES) — no formula can reach anything the
 * engine did not deliberately expose.
 */

import {
  evaluateFormula,
  FormulaError,
  FormulaScope,
} from './formula/formula-evaluator';
import { CalculationType, ComponentType } from './payroll.constants';
import { computeTax, TaxSlabInput } from './tax-calculation';

/** Round to 2 decimal places, the currency precision every money column uses. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * A single component already resolved to its effective calculation for one
 * employee/period — structure-level and employee-level overrides have been
 * folded in by the service before it reaches the math here.
 */
export interface ComputeComponent {
  component_id: string | null;
  code: string | null;
  name: string;
  type: ComponentType;
  // `& {}` keeps the literal autocomplete while still accepting whatever
  // string the column holds — a plain `| string` would collapse the union.
  calculation_type: CalculationType | (string & {});
  /** Flat amount, percentage, or per-unit rate depending on calculation_type. */
  amount: number;
  formula: string | null;
  /** Earnings only: whether this line adds to GROSS. */
  include_in_gross: boolean;
  /** Earnings only: whether this line is part of the taxable base. */
  is_taxable: boolean;
  /** Earnings only: whether this line contributes to the overtime base. */
  include_in_overtime: boolean;
  /** Earnings only: whether this line contributes to the leave/absence base. */
  include_in_leave_deduction: boolean;
  /** Earnings only: whether this line contributes to the bonus base. */
  include_in_bonus: boolean;
  display_order: number;
}

/** The period's measured attendance/leave/overtime figures. */
export interface ComputeInputs {
  working_days: number;
  present_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  late_count: number;
  late_minutes: number;
  overtime_hours: number;
  overtime_amount: number;
}

export type RoundingMode = 'none' | 'nearest' | 'up' | 'down';

/**
 * Phase 2 resolved rules (spec §4–10). The service resolves the active,
 * effective, highest-priority rule of each type into these plain-data shapes and
 * passes them in; the pure engine applies them at the right point in the payslip
 * sequence and emits a synthetic line with a "Why?" note for each. Every field
 * is optional, so a period with no rules configured computes exactly as Phase 1.
 */

/** Overtime earning (spec §7). Hours are gathered by the service; this turns them into money. */
export interface OvertimeRuleResolved {
  rate_multiplier: number;
  formula: string | null;
  cap_hours: number | null;
  /** Whether the OT earning counts toward the taxable base. Default true. */
  taxable: boolean;
}

/** Bonus earning (spec §8). */
export interface BonusRuleResolved {
  name: string;
  trigger: 'flat' | 'percent_gross' | 'formula';
  amount: number;
  formula: string | null;
  taxable: boolean;
}

/** Per-incident / per-minute late deduction (spec §5). */
export interface LateRuleResolved {
  name: string;
  grace_minutes: number;
  unit: 'per_minute' | 'per_incident' | 'half_day';
  amount: number;
  formula: string | null;
}

/** Extra penalty once late incidents cross a threshold in the period (spec §6). */
export interface RepeatedLateRuleResolved {
  name: string;
  threshold_count: number;
  penalty_days: number;
}

/** Absence deduction (spec §4) — supersedes the built-in default when present. */
export interface AbsentRuleResolved {
  name: string;
  mode: 'per_day' | 'formula';
  multiplier: number;
  formula: string | null;
}

/** How unpaid leave days are charged (spec §6). */
export interface LeaveRuleResolved {
  unpaid_leave_deduction: 'per_day' | 'none';
  multiplier: number;
}

/** Income tax (spec §10). Slabs + how to annualize; the base is computed here. */
export interface TaxRuleResolved {
  name: string;
  slabs: TaxSlabInput[];
  annualize: boolean;
  periods_per_year: number;
}

/** A pre-resolved loan installment for the period (spec §9). */
export interface LoanDeductionResolved {
  amount: number;
  note: string;
}

export interface ComputeContext {
  basic: number;
  workingHoursPerDay: number;
  components: ComputeComponent[];
  inputs: ComputeInputs;
  rounding: RoundingMode | (string & {});
  /**
   * Apply the default pro-rata deduction for unpaid days
   * (`BASIC / WORKING_DAYS × unpaid days`). On in Phase 1; a Phase 2 `absent`
   * rule (see `absentRule`) supersedes it when configured.
   */
  applyDefaultAbsentDeduction: boolean;

  // ---- Phase 2 rules (all optional; absent → Phase 1 behaviour) ----
  overtimeRule?: OvertimeRuleResolved | null;
  bonusRule?: BonusRuleResolved | null;
  lateRule?: LateRuleResolved | null;
  repeatedLateRule?: RepeatedLateRuleResolved | null;
  absentRule?: AbsentRuleResolved | null;
  leaveRule?: LeaveRuleResolved | null;
  taxRule?: TaxRuleResolved | null;
  loanDeduction?: LoanDeductionResolved | null;
}

export interface ComputedLine {
  component_id: string | null;
  code: string | null;
  label: string;
  type: ComponentType;
  calculation_type: string;
  amount: number;
  calc_note: string;
  display_order: number;
}

export interface ComputedResult {
  basic_salary: number;
  gross_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  lines: ComputedLine[];
  /** Non-fatal problems (bad formula, zero basic, …) surfaced to the UI. */
  warnings: string[];
}

/** Label used for the synthetic basic-salary earning line. */
export const BASIC_LINE_LABEL = 'Basic Salary';
/** Label used for the synthetic unpaid-days deduction line. */
export const ABSENCE_LINE_LABEL = 'Absence Deduction';
/** Labels for the Phase 2 synthetic rule-driven lines. */
export const OVERTIME_LINE_LABEL = 'Overtime';
export const BONUS_LINE_LABEL = 'Bonus';
export const TAX_LINE_LABEL = 'Income Tax';
export const LOAN_LINE_LABEL = 'Loan Repayment';
export const LATE_LINE_LABEL = 'Late Deduction';
export const REPEATED_LATE_LINE_LABEL = 'Repeated Late Penalty';

/**
 * Compute a full payslip from resolved inputs.
 *
 * Order of operations (documented because it defines what "GROSS" means):
 *   1. BASIC is emitted as the first earning line, straight from the resolved
 *      figure (assignment base salary or the employee's salary). Structures
 *      model allowances and deductions *on top of* BASIC; they do not restate
 *      it, so BASIC is never double-counted.
 *   2. Earning components are computed against a scope whose GROSS is
 *      provisionally BASIC. GROSS is then finalised as BASIC + every earning
 *      flagged `include_in_gross`.
 *   3. Deduction components are computed against the final GROSS (so a
 *      percent-of-gross tax sees the real gross).
 *   4. The default unpaid-days deduction is appended when enabled.
 *   5. Net = total earnings − total deductions, then the configured rounding.
 */
export function computePayslip(ctx: ComputeContext): ComputedResult {
  const warnings: string[] = [];
  const basic = round2(ctx.basic);
  if (basic <= 0) {
    warnings.push(
      'No base salary is set for this employee (BASIC is 0). Assign a salary structure with a base salary, or set the employee salary.',
    );
  }

  const { inputs } = ctx;
  const dailyRate = inputs.working_days > 0 ? basic / inputs.working_days : 0;
  const hourlyRate =
    ctx.workingHoursPerDay > 0 ? dailyRate / ctx.workingHoursPerDay : 0;

  // Provisional scope: GROSS starts at BASIC and is finalised after earnings.
  const scope: FormulaScope = {
    BASIC: basic,
    GROSS: basic,
    WORKING_DAYS: inputs.working_days,
    PRESENT_DAYS: inputs.present_days,
    ABSENT_DAYS: inputs.absent_days,
    PAID_LEAVE: inputs.paid_leave_days,
    UNPAID_LEAVE: inputs.unpaid_leave_days,
    OT_HOURS: inputs.overtime_hours,
    OT_AMOUNT: inputs.overtime_amount,
    LATE_MINUTES: inputs.late_minutes,
    HOURLY_RATE: round2(hourlyRate),
    DAILY_RATE: round2(dailyRate),
    BONUS: 0,
    TAX: 0,
    LOAN_DEDUCTION: 0,
  };

  const ordered = [...ctx.components].sort(
    (a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name),
  );
  const earnings = ordered.filter((c) => c.type === 'earning');
  const deductions = ordered.filter((c) => c.type === 'deduction');

  const lines: ComputedLine[] = [];

  // 1. Basic salary as the first earning line.
  lines.push({
    component_id: null,
    code: 'BASIC',
    label: BASIC_LINE_LABEL,
    type: 'earning',
    calculation_type: 'fixed',
    amount: basic,
    calc_note: `Base salary for the period = ${basic.toFixed(2)}.`,
    display_order: -1,
  });

  // 2. Overtime earning (Phase 2 rule) — before GROSS so it counts toward it.
  let grossAdditions = 0;
  let taxableBase = basic; // BASIC is always taxable.
  if (ctx.overtimeRule) {
    const ot = computeOvertime(
      ctx.overtimeRule,
      scope,
      inputs,
      hourlyRate,
      warnings,
    );
    scope.OT_AMOUNT = ot.amount;
    if (ot.amount > 0) {
      lines.push(
        syntheticLine(
          'OT',
          OVERTIME_LINE_LABEL,
          'earning',
          'per_hour',
          ot.amount,
          ot.note,
          -1,
        ),
      );
      grossAdditions += ot.amount;
      if (ctx.overtimeRule.taxable) taxableBase += ot.amount;
    }
  }

  // 3. Earning components (scope.GROSS still provisional = BASIC).
  for (const component of earnings) {
    const { amount, note } = evaluateComponent(
      component,
      scope,
      inputs,
      warnings,
    );
    lines.push(toLine(component, amount, note));
    if (component.include_in_gross) grossAdditions += amount;
    if (component.is_taxable) taxableBase += amount;
  }

  // 4. Bonus earning (Phase 2 rule) — percent triggers use gross-so-far.
  if (ctx.bonusRule) {
    const provisionalGross = round2(basic + grossAdditions);
    const bonus = computeBonus(
      ctx.bonusRule,
      scope,
      provisionalGross,
      warnings,
    );
    scope.BONUS = bonus.amount;
    if (bonus.amount > 0) {
      lines.push(
        syntheticLine(
          'BONUS',
          ctx.bonusRule.name || BONUS_LINE_LABEL,
          'earning',
          'fixed',
          bonus.amount,
          bonus.note,
          -1,
        ),
      );
      grossAdditions += bonus.amount;
      if (ctx.bonusRule.taxable) taxableBase += bonus.amount;
    }
  }

  const gross = round2(basic + grossAdditions);
  scope.GROSS = gross;

  // 5. Tax + loan amounts computed now so deduction formulas can reference
  //    TAX / LOAN_DEDUCTION. Taxable base = BASIC + taxable earnings above.
  let taxLine: { amount: number; note: string } | null = null;
  if (ctx.taxRule) {
    taxLine = computeTaxLine(ctx.taxRule, round2(taxableBase));
    scope.TAX = taxLine.amount;
  }
  if (ctx.loanDeduction && ctx.loanDeduction.amount > 0) {
    scope.LOAN_DEDUCTION = round2(ctx.loanDeduction.amount);
  }

  // 6. Deduction components against the finalised GROSS (TAX/LOAN in scope).
  for (const component of deductions) {
    const { amount, note } = evaluateComponent(
      component,
      scope,
      inputs,
      warnings,
    );
    lines.push(toLine(component, amount, note));
  }

  // 7. Income tax (Phase 2) — a synthetic deduction line.
  //
  // Labelled "Income Tax" rather than the config's name: unlike a bonus or late
  // rule, whose name HR writes as the payslip wording, a tax config name is a
  // regime/version identifier ("FBR Salaried 2026-27") that means nothing to the
  // employee reading their payslip. It belongs in the "Why?" note, which
  // `computeTaxLine` carries.
  if (taxLine && taxLine.amount > 0) {
    lines.push(
      syntheticLine(
        'TAX',
        TAX_LINE_LABEL,
        'deduction',
        'formula',
        taxLine.amount,
        taxLine.note,
        9990,
      ),
    );
  }

  // 8. Loan repayment (Phase 2), pre-resolved by the loan service.
  if (ctx.loanDeduction && scope.LOAN_DEDUCTION > 0) {
    lines.push(
      syntheticLine(
        'LOAN',
        LOAN_LINE_LABEL,
        'deduction',
        'fixed',
        round2(ctx.loanDeduction.amount),
        ctx.loanDeduction.note,
        9991,
      ),
    );
  }

  // 9. Late deduction (Phase 2).
  if (ctx.lateRule) {
    const late = computeLate(ctx.lateRule, scope, inputs, dailyRate, warnings);
    if (late.amount > 0) {
      lines.push(
        syntheticLine(
          'LATE',
          ctx.lateRule.name || LATE_LINE_LABEL,
          'deduction',
          'formula',
          late.amount,
          late.note,
          9992,
        ),
      );
    }
  }

  // 10. Repeated-late penalty (Phase 2).
  if (ctx.repeatedLateRule) {
    const rl = computeRepeatedLate(ctx.repeatedLateRule, inputs, dailyRate);
    if (rl.amount > 0) {
      lines.push(
        syntheticLine(
          'REPEATED_LATE',
          ctx.repeatedLateRule.name || REPEATED_LATE_LINE_LABEL,
          'deduction',
          'per_day',
          rl.amount,
          rl.note,
          9993,
        ),
      );
    }
  }

  // 11. Absence deduction — rule-driven when configured, else the Phase 1
  //     default (unchanged, so a zero-rule period is byte-for-byte identical).
  const absence = computeAbsence(
    ctx,
    scope,
    inputs,
    basic,
    dailyRate,
    warnings,
  );
  if (absence) lines.push(absence);

  const totalEarnings = round2(
    lines
      .filter((l) => l.type === 'earning')
      .reduce((sum, l) => sum + l.amount, 0),
  );
  const totalDeductions = round2(
    lines
      .filter((l) => l.type === 'deduction')
      .reduce((sum, l) => sum + l.amount, 0),
  );
  const net = applyRounding(totalEarnings - totalDeductions, ctx.rounding);

  return {
    basic_salary: basic,
    gross_salary: gross,
    total_earnings: totalEarnings,
    total_deductions: totalDeductions,
    net_salary: net,
    lines,
    warnings,
  };
}

/** Build a payslip line from a component and its computed amount. */
function toLine(
  component: ComputeComponent,
  amount: number,
  note: string,
): ComputedLine {
  return {
    component_id: component.component_id,
    code: component.code,
    label: component.name,
    type: component.type,
    calculation_type: String(component.calculation_type),
    amount,
    calc_note: note,
    display_order: component.display_order,
  };
}

/** Build a payslip line for a rule-driven (non-component) amount. */
function syntheticLine(
  code: string,
  label: string,
  type: ComponentType,
  calculationType: string,
  amount: number,
  note: string,
  displayOrder: number,
): ComputedLine {
  return {
    component_id: null,
    code,
    label,
    type,
    calculation_type: calculationType,
    amount,
    calc_note: note,
    display_order: displayOrder,
  };
}

/**
 * Overtime pay (spec §7). A formula wins when supplied; otherwise
 * `hours × hourly rate × multiplier`, with hours capped when `cap_hours` is set.
 * Hours themselves are gathered by the service and already restricted to
 * non-working days / government holidays per policy.
 */
function computeOvertime(
  rule: OvertimeRuleResolved,
  scope: FormulaScope,
  inputs: ComputeInputs,
  hourlyRate: number,
  warnings: string[],
): { amount: number; note: string } {
  const hours =
    rule.cap_hours != null
      ? Math.min(inputs.overtime_hours, rule.cap_hours)
      : inputs.overtime_hours;
  if (hours <= 0) return { amount: 0, note: 'No overtime hours this period.' };

  if (rule.formula) {
    try {
      const amount = round2(
        evaluateFormula(rule.formula, { ...scope, OT_HOURS: hours }),
      );
      return {
        amount,
        note: `Overtime formula "${rule.formula}" = ${amount.toFixed(2)}.`,
      };
    } catch (err) {
      const message =
        err instanceof FormulaError ? err.message : 'Invalid formula.';
      warnings.push(`Overtime rule: ${message}`);
      return {
        amount: 0,
        note: `Overtime formula could not be evaluated: ${message}`,
      };
    }
  }

  const amount = round2(hourlyRate * rule.rate_multiplier * hours);
  return {
    amount,
    note:
      `${hours} overtime hour(s) × hourly rate ${round2(hourlyRate).toFixed(2)} ` +
      `× ${rule.rate_multiplier} = ${amount.toFixed(2)}.`,
  };
}

/** Bonus earning (spec §8): flat, percent of gross-so-far, or a formula. */
function computeBonus(
  rule: BonusRuleResolved,
  scope: FormulaScope,
  provisionalGross: number,
  warnings: string[],
): { amount: number; note: string } {
  switch (rule.trigger) {
    case 'flat':
      return {
        amount: round2(rule.amount),
        note: `Bonus (flat) = ${round2(rule.amount).toFixed(2)}.`,
      };
    case 'percent_gross': {
      const amount = round2((provisionalGross * rule.amount) / 100);
      return {
        amount,
        note: `Bonus ${rule.amount}% of gross (${provisionalGross.toFixed(2)}) = ${amount.toFixed(2)}.`,
      };
    }
    case 'formula': {
      const formula = rule.formula ?? '';
      try {
        const amount = round2(
          evaluateFormula(formula, { ...scope, GROSS: provisionalGross }),
        );
        return {
          amount,
          note: `Bonus formula "${formula}" = ${amount.toFixed(2)}.`,
        };
      } catch (err) {
        const message =
          err instanceof FormulaError ? err.message : 'Invalid formula.';
        warnings.push(`Bonus rule: ${message}`);
        return {
          amount: 0,
          note: `Bonus formula could not be evaluated: ${message}`,
        };
      }
    }
    default:
      return { amount: 0, note: 'Unknown bonus trigger; treated as 0.' };
  }
}

/**
 * Compute one component's amount and its "Why?" note. A bad formula never
 * throws out of here — it yields 0 with an explanatory note and a warning, so
 * one misconfigured component cannot break a whole payroll run.
 */
function evaluateComponent(
  component: ComputeComponent,
  scope: FormulaScope,
  inputs: ComputeInputs,
  warnings: string[],
): { amount: number; note: string } {
  const rate = component.amount;
  switch (component.calculation_type) {
    case 'fixed':
      return {
        amount: round2(rate),
        note: `Fixed amount = ${round2(rate).toFixed(2)}.`,
      };

    case 'percent_basic': {
      const amount = round2((scope.BASIC * rate) / 100);
      return {
        amount,
        note: `${rate}% of BASIC (${scope.BASIC.toFixed(2)}) = ${amount.toFixed(2)}.`,
      };
    }

    case 'percent_gross': {
      const amount = round2((scope.GROSS * rate) / 100);
      return {
        amount,
        note: `${rate}% of GROSS (${scope.GROSS.toFixed(2)}) = ${amount.toFixed(2)}.`,
      };
    }

    case 'per_day': {
      const amount = round2(rate * inputs.present_days);
      return {
        amount,
        note: `${rate} × ${inputs.present_days} present day(s) = ${amount.toFixed(2)}.`,
      };
    }

    case 'per_hour': {
      const amount = round2(rate * inputs.overtime_hours);
      return {
        amount,
        note: `${rate} × ${inputs.overtime_hours} overtime hour(s) = ${amount.toFixed(2)}.`,
      };
    }

    case 'formula': {
      const formula = component.formula ?? '';
      try {
        const amount = round2(evaluateFormula(formula, scope));
        return { amount, note: `Formula "${formula}" = ${amount.toFixed(2)}.` };
      } catch (err) {
        const message =
          err instanceof FormulaError ? err.message : 'Invalid formula.';
        warnings.push(`Component "${component.name}": ${message}`);
        return {
          amount: 0,
          note: `Formula "${formula}" could not be evaluated: ${message}`,
        };
      }
    }

    default:
      warnings.push(
        `Component "${component.name}": unknown calculation type "${component.calculation_type}".`,
      );
      return {
        amount: 0,
        note: `Unknown calculation type "${component.calculation_type}"; treated as 0.`,
      };
  }
}

/**
 * Income tax for the period (spec §10). Delegates the slab arithmetic to the
 * pure `computeTax`; annualizes the taxable base when the config says to, then
 * divides the annual liability back down to the period.
 */
function computeTaxLine(
  rule: TaxRuleResolved,
  periodTaxable: number,
): { amount: number; note: string } {
  const periods = rule.periods_per_year > 0 ? rule.periods_per_year : 12;
  const result = rule.annualize
    ? computeTax(periodTaxable * periods, rule.slabs, periods)
    : computeTax(periodTaxable, rule.slabs, 1);
  const amount = round2(
    rule.annualize ? result.monthly_tax : result.annual_tax,
  );
  const basis = rule.annualize
    ? `Taxable ${periodTaxable.toFixed(2)} × ${periods} = ${(
        periodTaxable * periods
      ).toFixed(
        2,
      )}/yr → annual tax ${result.annual_tax.toFixed(2)} ÷ ${periods} = ${amount.toFixed(2)}.`
    : `Tax on ${periodTaxable.toFixed(2)} = ${amount.toFixed(2)}.`;
  // Name the config here so the payslip line can stay employee-readable while
  // the "Why?" still records exactly which slab table produced the number.
  const note = `${basis} ${result.note}${rule.name ? ` (per "${rule.name}")` : ''}`;
  return { amount, note };
}

/**
 * Late-arrival deduction (spec §5). Minutes over the grace threshold drive a
 * per-minute or per-incident charge, a half-day cut, or a custom formula.
 */
function computeLate(
  rule: LateRuleResolved,
  scope: FormulaScope,
  inputs: ComputeInputs,
  dailyRate: number,
  warnings: string[],
): { amount: number; note: string } {
  const chargeableMinutes = Math.max(
    0,
    inputs.late_minutes - rule.grace_minutes,
  );

  if (rule.formula) {
    try {
      const amount = round2(
        evaluateFormula(rule.formula, {
          ...scope,
          LATE_MINUTES: chargeableMinutes,
        }),
      );
      return {
        amount,
        note: `Late formula "${rule.formula}" on ${chargeableMinutes} min over grace = ${amount.toFixed(2)}.`,
      };
    } catch (err) {
      const message =
        err instanceof FormulaError ? err.message : 'Invalid formula.';
      warnings.push(`Late rule: ${message}`);
      return {
        amount: 0,
        note: `Late formula could not be evaluated: ${message}`,
      };
    }
  }

  switch (rule.unit) {
    case 'per_minute': {
      const amount = round2(chargeableMinutes * rule.amount);
      return {
        amount,
        note: `${chargeableMinutes} min over ${rule.grace_minutes} grace × ${rule.amount} = ${amount.toFixed(2)}.`,
      };
    }
    case 'per_incident': {
      const incidents = chargeableMinutes > 0 ? inputs.late_count : 0;
      const amount = round2(incidents * rule.amount);
      return {
        amount,
        note: `${incidents} late incident(s) × ${rule.amount} = ${amount.toFixed(2)}.`,
      };
    }
    case 'half_day': {
      const amount = chargeableMinutes > 0 ? round2(dailyRate / 2) : 0;
      return {
        amount,
        note:
          chargeableMinutes > 0
            ? `Half-day cut (daily rate ${round2(dailyRate).toFixed(2)} / 2) = ${amount.toFixed(2)}.`
            : 'Within grace; no late deduction.',
      };
    }
    default:
      return { amount: 0, note: 'Unknown late unit; treated as 0.' };
  }
}

/**
 * Extra penalty once late incidents cross a threshold in the period (spec §6),
 * charged as N days of pay.
 */
function computeRepeatedLate(
  rule: RepeatedLateRuleResolved,
  inputs: ComputeInputs,
  dailyRate: number,
): { amount: number; note: string } {
  if (inputs.late_count < rule.threshold_count) {
    return { amount: 0, note: 'Below repeated-late threshold.' };
  }
  const amount = round2(dailyRate * rule.penalty_days);
  return {
    amount,
    note:
      `${inputs.late_count} lates ≥ threshold ${rule.threshold_count}: ` +
      `${rule.penalty_days} day(s) × daily rate ${round2(dailyRate).toFixed(2)} = ${amount.toFixed(2)}.`,
  };
}

/**
 * The absence deduction line. A Phase 2 `absent` rule supersedes the built-in
 * default; with no rule and `applyDefaultAbsentDeduction` on, this is exactly
 * the Phase 1 calculation (so a zero-rule period is unchanged).
 */
function computeAbsence(
  ctx: ComputeContext,
  scope: FormulaScope,
  inputs: ComputeInputs,
  basic: number,
  dailyRate: number,
  warnings: string[],
): ComputedLine | null {
  // The leave rule decides whether unpaid-leave days are charged, and at what
  // multiple of a day's pay. Absent days are always charged (the absent rule /
  // default governs them). With no leave rule, unpaid leave is deducted at 1×
  // — exactly the Phase 1 behaviour.
  const leaveMultiplier = ctx.leaveRule?.multiplier ?? 1;
  const chargedUnpaidLeave =
    ctx.leaveRule && ctx.leaveRule.unpaid_leave_deduction === 'none'
      ? 0
      : round2(inputs.unpaid_leave_days * leaveMultiplier);
  const unpaidDays = round2(inputs.absent_days + chargedUnpaidLeave);

  if (ctx.absentRule) {
    if (ctx.absentRule.mode === 'formula' && ctx.absentRule.formula) {
      try {
        const amount = round2(evaluateFormula(ctx.absentRule.formula, scope));
        if (amount <= 0) return null;
        return syntheticLine(
          'ABSENCE',
          ctx.absentRule.name || ABSENCE_LINE_LABEL,
          'deduction',
          'formula',
          amount,
          `Absence formula "${ctx.absentRule.formula}" = ${amount.toFixed(2)}.`,
          9999,
        );
      } catch (err) {
        const message =
          err instanceof FormulaError ? err.message : 'Invalid formula.';
        warnings.push(`Absent rule: ${message}`);
        return null;
      }
    }
    // per_day mode with a configurable multiplier on the daily rate.
    if (unpaidDays > 0 && inputs.working_days > 0 && basic > 0) {
      const multiplier = ctx.absentRule.multiplier || 1;
      const amount = round2(dailyRate * multiplier * unpaidDays);
      return syntheticLine(
        'ABSENCE',
        ctx.absentRule.name || ABSENCE_LINE_LABEL,
        'deduction',
        'per_day',
        amount,
        `${unpaidDays} unpaid day(s) × daily rate ${round2(dailyRate).toFixed(2)}` +
          `${multiplier !== 1 ? ` × ${multiplier}` : ''} = ${amount.toFixed(2)}.`,
        9999,
      );
    }
    return null;
  }

  // Phase 1 default (unchanged when no leave rule reduces unpaid leave).
  if (ctx.applyDefaultAbsentDeduction) {
    if (unpaidDays > 0 && inputs.working_days > 0 && basic > 0) {
      const amount = round2(dailyRate * unpaidDays);
      return {
        component_id: null,
        code: 'ABSENCE',
        label: ABSENCE_LINE_LABEL,
        type: 'deduction',
        calculation_type: 'per_day',
        amount,
        calc_note:
          `${unpaidDays} unpaid day(s) ` +
          `(${inputs.absent_days} absent + ${chargedUnpaidLeave} unpaid leave) ` +
          `× daily rate (BASIC ${basic.toFixed(2)} / ${inputs.working_days} working days = ${round2(
            dailyRate,
          ).toFixed(2)}) = ${amount.toFixed(2)}.`,
        display_order: 9999,
      };
    }
  }
  return null;
}

/** Apply the period's rounding mode to the net figure. */
function applyRounding(
  net: number,
  mode: RoundingMode | (string & {}),
): number {
  switch (mode) {
    case 'nearest':
      return Math.round(net);
    case 'up':
      return Math.ceil(net);
    case 'down':
      return Math.floor(net);
    case 'none':
    default:
      return round2(net);
  }
}
