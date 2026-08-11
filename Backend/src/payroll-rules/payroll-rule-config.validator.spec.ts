/**
 * Validator tests for rule `config` payloads, with an emphasis on the
 * safe-evaluator regression the spec requires (§15, verification step 13).
 *
 * Phase 2 introduced new places a user can type a formula — the absent rule,
 * the late rule, the overtime rule and the bonus rule. Each one must reach the
 * same whitelist evaluator that guards Phase 1 component formulas, so a config
 * field can never become a remote-code hole. The probes below are the payloads
 * that would matter if `eval`/`new Function` were ever reintroduced: they must
 * be rejected as data, not executed.
 */

import { BadRequestException } from '@nestjs/common';

import { assertRuleConfigValid } from './payroll-rule-config.validator';

/** Payloads that must never be accepted into any formula field. */
const INJECTION_PROBES = [
  'process.exit(1)',
  'require("fs").readFileSync("/etc/passwd")',
  'globalThis.process.env.DB_PASSWORD',
  'constructor.constructor("return 1")()',
  '(() => 1)()',
  'BASIC; console.log(1)',
  'BASIC + process.env.SECRET',
  '__proto__',
  'this.constructor',
  'import("fs")',
  'BASIC`1`',
  '{}.toString',
];

describe('assertRuleConfigValid', () => {
  it('rejects a non-object config', () => {
    expect(() => assertRuleConfigValid('absent', null as never)).toThrow(
      BadRequestException,
    );
  });

  it('rejects an unsupported rule_type', () => {
    expect(() =>
      assertRuleConfigValid('nonsense' as never, {}),
    ).toThrow(/Unsupported rule_type/);
  });

  // ---- safe-evaluator regression -----------------------------------------
  //
  // Every formula-bearing rule shape, probed with the same payloads. If any of
  // these were accepted the field would be executable, which is exactly what
  // the approved-variable evaluator exists to prevent.
  describe('formula fields reject arbitrary code', () => {
    const formulaShapes: Array<{
      label: string;
      build: (formula: string) => [Parameters<typeof assertRuleConfigValid>[0], Record<string, unknown>];
    }> = [
      {
        label: 'absent.config.formula',
        build: (formula) => ['absent', { mode: 'formula', formula }],
      },
      {
        label: 'late.config.formula',
        build: (formula) => [
          'late',
          { grace_minutes: 10, unit: 'per_minute', formula },
        ],
      },
      {
        label: 'overtime.config.formula',
        build: (formula) => [
          'overtime',
          {
            enabled: true,
            applies_to: ['non_working_day'],
            rate_multiplier: 1,
            formula,
          },
        ],
      },
      {
        label: 'bonus.config.formula',
        build: (formula) => [
          'bonus',
          { trigger: 'formula', taxable: false, formula },
        ],
      },
    ];

    for (const shape of formulaShapes) {
      for (const probe of INJECTION_PROBES) {
        it(`${shape.label} rejects ${JSON.stringify(probe)}`, () => {
          const [type, config] = shape.build(probe);
          expect(() => assertRuleConfigValid(type, config)).toThrow(
            BadRequestException,
          );
        });
      }

      // `validateFormula` dry-runs against a zero-filled scope, so a valid
      // fixture must avoid dividing by a variable (WORKING_DAYS would be 0
      // there and read as a real divide-by-zero).
      it(`${shape.label} still accepts an approved-variable formula`, () => {
        const [type, config] = shape.build('DAILY_RATE * ABSENT_DAYS * 1.5');
        expect(() => assertRuleConfigValid(type, config)).not.toThrow();
      });

      it(`${shape.label} rejects an unknown variable`, () => {
        const [type, config] = shape.build('SALARY * 2');
        expect(() => assertRuleConfigValid(type, config)).toThrow(
          /Invalid formula/,
        );
      });

      it(`${shape.label} rejects an empty formula`, () => {
        const [type, config] = shape.build('   ');
        expect(() => assertRuleConfigValid(type, config)).toThrow(
          BadRequestException,
        );
      });
    }
  });

  // ---- per-type shape rules ----------------------------------------------
  describe('absent', () => {
    it('accepts per_day with no multiplier', () => {
      expect(() => assertRuleConfigValid('absent', { mode: 'per_day' })).not.toThrow();
    });

    it('accepts per_day with a multiplier', () => {
      expect(() =>
        assertRuleConfigValid('absent', { mode: 'per_day', multiplier: 1.5 }),
      ).not.toThrow();
    });

    it('rejects an unknown mode', () => {
      expect(() => assertRuleConfigValid('absent', { mode: 'weekly' })).toThrow(
        /config.mode must be one of/,
      );
    });

    it('rejects a negative multiplier', () => {
      expect(() =>
        assertRuleConfigValid('absent', { mode: 'per_day', multiplier: -1 }),
      ).toThrow(/must be a number >= 0/);
    });
  });

  describe('late', () => {
    it('accepts a per_incident amount', () => {
      expect(() =>
        assertRuleConfigValid('late', {
          grace_minutes: 15,
          unit: 'per_incident',
          amount: 500,
        }),
      ).not.toThrow();
    });

    it('accepts half_day without an amount', () => {
      expect(() =>
        assertRuleConfigValid('late', { grace_minutes: 0, unit: 'half_day' }),
      ).not.toThrow();
    });

    it('requires an amount for a non-half_day unit', () => {
      expect(() =>
        assertRuleConfigValid('late', { grace_minutes: 5, unit: 'per_minute' }),
      ).toThrow(/config.amount/);
    });

    it('rejects negative grace minutes', () => {
      expect(() =>
        assertRuleConfigValid('late', {
          grace_minutes: -5,
          unit: 'per_incident',
          amount: 100,
        }),
      ).toThrow(/config.grace_minutes/);
    });
  });

  describe('repeated_late', () => {
    it('accepts a threshold and penalty', () => {
      expect(() =>
        assertRuleConfigValid('repeated_late', {
          threshold_count: 3,
          penalty_days: 1,
        }),
      ).not.toThrow();
    });

    it('rejects a zero threshold', () => {
      expect(() =>
        assertRuleConfigValid('repeated_late', {
          threshold_count: 0,
          penalty_days: 1,
        }),
      ).toThrow(/integer >= 1/);
    });

    it('rejects a fractional threshold', () => {
      expect(() =>
        assertRuleConfigValid('repeated_late', {
          threshold_count: 2.5,
          penalty_days: 1,
        }),
      ).toThrow(/integer >= 1/);
    });
  });

  describe('leave', () => {
    it('accepts none', () => {
      expect(() =>
        assertRuleConfigValid('leave', { unpaid_leave_deduction: 'none' }),
      ).not.toThrow();
    });

    it('accepts per_day with a multiplier', () => {
      expect(() =>
        assertRuleConfigValid('leave', {
          unpaid_leave_deduction: 'per_day',
          multiplier: 1,
        }),
      ).not.toThrow();
    });

    it('rejects an unknown deduction mode', () => {
      expect(() =>
        assertRuleConfigValid('leave', { unpaid_leave_deduction: 'always' }),
      ).toThrow(/must be one of/);
    });
  });

  describe('overtime', () => {
    // The spec defaults OT off, and only non-working days plus government
    // holidays qualify — both are shape-checked here.
    it('accepts the disabled default', () => {
      expect(() =>
        assertRuleConfigValid('overtime', {
          enabled: false,
          applies_to: ['non_working_day', 'govt_holiday'],
          rate_multiplier: 1,
        }),
      ).not.toThrow();
    });

    it('rejects a non-boolean enabled', () => {
      expect(() =>
        assertRuleConfigValid('overtime', {
          enabled: 'yes',
          applies_to: ['non_working_day'],
          rate_multiplier: 1,
        }),
      ).toThrow(/must be a boolean/);
    });

    it('rejects a non-array applies_to', () => {
      expect(() =>
        assertRuleConfigValid('overtime', {
          enabled: true,
          applies_to: 'non_working_day',
          rate_multiplier: 1,
        }),
      ).toThrow(/must be an array/);
    });

    it('rejects an unknown applies_to entry', () => {
      expect(() =>
        assertRuleConfigValid('overtime', {
          enabled: true,
          applies_to: ['every_day'],
          rate_multiplier: 1,
        }),
      ).toThrow(/applies_to/);
    });

    it('rejects a negative cap_hours', () => {
      expect(() =>
        assertRuleConfigValid('overtime', {
          enabled: true,
          applies_to: ['govt_holiday'],
          rate_multiplier: 2,
          cap_hours: -1,
        }),
      ).toThrow(/cap_hours/);
    });
  });

  describe('bonus', () => {
    it('accepts a flat amount', () => {
      expect(() =>
        assertRuleConfigValid('bonus', {
          trigger: 'flat',
          taxable: true,
          amount: 25000,
        }),
      ).not.toThrow();
    });

    it('accepts a percent_gross within range', () => {
      expect(() =>
        assertRuleConfigValid('bonus', {
          trigger: 'percent_gross',
          taxable: false,
          amount: 10,
        }),
      ).not.toThrow();
    });

    it('rejects a percent_gross above 100', () => {
      expect(() =>
        assertRuleConfigValid('bonus', {
          trigger: 'percent_gross',
          taxable: false,
          amount: 150,
        }),
      ).toThrow(/percentage between 0 and 100/);
    });

    it('rejects a missing taxable flag', () => {
      expect(() =>
        assertRuleConfigValid('bonus', { trigger: 'flat', amount: 1000 }),
      ).toThrow(/config.taxable/);
    });
  });

  describe('appraisal', () => {
    it('accepts any object — reserved for a later pass', () => {
      expect(() => assertRuleConfigValid('appraisal', {})).not.toThrow();
      expect(() =>
        assertRuleConfigValid('appraisal', { anything: true }),
      ).not.toThrow();
    });
  });
});
