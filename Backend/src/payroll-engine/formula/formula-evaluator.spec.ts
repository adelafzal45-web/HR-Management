import {
  evaluateFormula,
  validateFormula,
  FormulaError,
  PAYROLL_VARIABLE_NAMES,
} from './formula-evaluator';

describe('evaluateFormula', () => {
  const scope = {
    BASIC: 100000,
    GROSS: 130000,
    WORKING_DAYS: 26,
    ABSENT_DAYS: 2,
    OT_HOURS: 5,
  };

  it('evaluates a plain number', () => {
    expect(evaluateFormula('42', {})).toBe(42);
    expect(evaluateFormula('0.5', {})).toBe(0.5);
    expect(evaluateFormula('.25', {})).toBe(0.25);
  });

  it('resolves whitelisted variables', () => {
    expect(evaluateFormula('BASIC', scope)).toBe(100000);
    expect(evaluateFormula('GROSS', scope)).toBe(130000);
  });

  it('honours operator precedence', () => {
    expect(evaluateFormula('2 + 3 * 4', {})).toBe(14);
    expect(evaluateFormula('10 - 2 - 3', {})).toBe(5); // left-associative
  });

  it('honours parentheses', () => {
    expect(evaluateFormula('(2 + 3) * 4', {})).toBe(20);
    expect(
      evaluateFormula('BASIC / WORKING_DAYS * ABSENT_DAYS', scope),
    ).toBeCloseTo((100000 / 26) * 2, 6);
  });

  it('supports percentage-style expressions', () => {
    expect(evaluateFormula('BASIC * 0.1', scope)).toBeCloseTo(10000, 6);
    expect(evaluateFormula('GROSS * 10 / 100', scope)).toBeCloseTo(13000, 6);
  });

  it('handles unary minus', () => {
    expect(evaluateFormula('-BASIC', scope)).toBe(-100000);
    expect(evaluateFormula('5 * -2', {})).toBe(-10);
  });

  it('treats an unset whitelisted variable as 0', () => {
    expect(evaluateFormula('LOAN_DEDUCTION + 100', {})).toBe(100);
  });

  it('rejects an unknown variable', () => {
    expect(() => evaluateFormula('SALARY * 2', scope)).toThrow(FormulaError);
    expect(() => evaluateFormula('SALARY * 2', scope)).toThrow(
      /Unknown variable/,
    );
  });

  it('rejects division by zero', () => {
    expect(() => evaluateFormula('BASIC / 0', scope)).toThrow(
      /Division by zero/,
    );
  });

  it('rejects function-call syntax (no arbitrary code)', () => {
    expect(() => evaluateFormula('process.exit(1)', scope)).toThrow(
      FormulaError,
    );
    expect(() => evaluateFormula('max(1, 2)', scope)).toThrow(FormulaError);
  });

  it('rejects stray / unexpected characters', () => {
    expect(() => evaluateFormula('2 ** 3', scope)).toThrow(FormulaError);
    expect(() => evaluateFormula('BASIC & 1', scope)).toThrow(FormulaError);
    expect(() => evaluateFormula('', scope)).toThrow(/empty/);
  });

  it('rejects unbalanced parentheses', () => {
    expect(() => evaluateFormula('(2 + 3', {})).toThrow(/closing parenthesis/);
    expect(() => evaluateFormula('2 + 3)', {})).toThrow(FormulaError);
  });
});

describe('validateFormula', () => {
  it('returns null for a valid formula', () => {
    expect(validateFormula('BASIC * 0.1')).toBeNull();
    expect(validateFormula('(GROSS - BASIC) / 2')).toBeNull();
  });

  it('returns a message for an invalid formula', () => {
    expect(validateFormula('BASIC * ')).not.toBeNull();
    expect(validateFormula('FOO + 1')).toMatch(/Unknown variable/);
  });

  it('accepts every declared variable name', () => {
    for (const name of PAYROLL_VARIABLE_NAMES) {
      expect(validateFormula(`${name} + 1`)).toBeNull();
    }
  });
});
