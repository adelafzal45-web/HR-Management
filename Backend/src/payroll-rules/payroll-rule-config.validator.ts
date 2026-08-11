import { BadRequestException } from '@nestjs/common';

import { validateFormula } from '../payroll-engine/formula/formula-evaluator';
import { OVERTIME_APPLIES_TO, RuleType } from './payroll-rule.constants';

/**
 * Validates a rule's `config` against the shape its `rule_type` requires,
 * before it is ever stored. This is the rule-builder counterpart to
 * `SalaryComponentsService.assertFormulaConsistent`: an inconsistent config
 * (missing multiplier, unknown formula variable, out-of-range percentage) is a
 * 400 here rather than a silent zero at calculation time. Every embedded
 * formula is checked with the safe evaluator's `validateFormula` — it is data,
 * never executed.
 */
export function assertRuleConfigValid(
  ruleType: RuleType,
  config: Record<string, unknown>,
): void {
  if (config == null || typeof config !== 'object') {
    throw new BadRequestException('config must be an object.');
  }

  switch (ruleType) {
    case 'absent':
      assertDeductionExpr(config, 'config');
      return;

    case 'late': {
      assertNonNegativeNumber(config.grace_minutes, 'config.grace_minutes');
      assertOneOf(config.unit, ['per_minute', 'per_incident', 'half_day'], 'config.unit');
      if (config.formula != null) {
        assertFormula(config.formula, 'config.formula');
      } else if (config.unit !== 'half_day') {
        assertNonNegativeNumber(config.amount, 'config.amount');
      }
      return;
    }

    case 'repeated_late':
      assertPositiveInt(config.threshold_count, 'config.threshold_count');
      assertNonNegativeNumber(config.penalty_days, 'config.penalty_days');
      return;

    case 'leave':
      assertOneOf(
        config.unpaid_leave_deduction,
        ['per_day', 'none'],
        'config.unpaid_leave_deduction',
      );
      if (config.unpaid_leave_deduction === 'per_day' && config.multiplier != null) {
        assertNonNegativeNumber(config.multiplier, 'config.multiplier');
      }
      return;

    case 'overtime': {
      assertBoolean(config.enabled, 'config.enabled');
      if (!Array.isArray(config.applies_to)) {
        throw new BadRequestException('config.applies_to must be an array.');
      }
      for (const entry of config.applies_to) {
        assertOneOf(entry, [...OVERTIME_APPLIES_TO], 'config.applies_to[]');
      }
      assertNonNegativeNumber(config.rate_multiplier, 'config.rate_multiplier');
      if (config.formula != null) assertFormula(config.formula, 'config.formula');
      if (config.cap_hours != null) {
        assertNonNegativeNumber(config.cap_hours, 'config.cap_hours');
      }
      return;
    }

    case 'bonus': {
      assertOneOf(
        config.trigger,
        ['flat', 'percent_gross', 'formula'],
        'config.trigger',
      );
      assertBoolean(config.taxable, 'config.taxable');
      if (config.trigger === 'formula') {
        assertFormula(config.formula, 'config.formula');
      } else if (config.trigger === 'percent_gross') {
        assertPercentage(config.amount, 'config.amount');
      } else {
        assertNonNegativeNumber(config.amount, 'config.amount');
      }
      return;
    }

    case 'appraisal':
      // Reserved: the enum and table hold appraisal rules for forward
      // compatibility, but the engine does not read them yet. Accept any object
      // so the shape can be defined later without a migration.
      return;

    default:
      throw new BadRequestException(`Unsupported rule_type "${ruleType}".`);
  }
}

/** A DeductionExpr: per_day with an optional multiplier, or a formula. */
function assertDeductionExpr(
  config: Record<string, unknown>,
  path: string,
): void {
  assertOneOf(config.mode, ['per_day', 'formula'], `${path}.mode`);
  if (config.mode === 'formula') {
    assertFormula(config.formula, `${path}.formula`);
  } else if (config.multiplier != null) {
    assertNonNegativeNumber(config.multiplier, `${path}.multiplier`);
  }
}

function assertFormula(value: unknown, path: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${path} is required and must be a formula string.`);
  }
  const error = validateFormula(value);
  if (error) {
    throw new BadRequestException(`Invalid formula at ${path}: ${error}`);
  }
}

function assertNonNegativeNumber(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException(`${path} must be a number >= 0.`);
  }
}

function assertPositiveInt(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${path} must be an integer >= 1.`);
  }
}

function assertPercentage(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new BadRequestException(`${path} must be a percentage between 0 and 100.`);
  }
}

function assertBoolean(value: unknown, path: string): void {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${path} must be a boolean.`);
  }
}

function assertOneOf(value: unknown, allowed: string[], path: string): void {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new BadRequestException(`${path} must be one of: ${allowed.join(', ')}.`);
  }
}
