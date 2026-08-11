import {
  computePayslip,
  ComputeComponent,
  ComputeContext,
  ComputeInputs,
  BASIC_LINE_LABEL,
  ABSENCE_LINE_LABEL,
  REIMBURSEMENT_LINE_LABEL,
  TAX_LINE_LABEL,
  round2,
} from './payroll-calculation';

/**
 * Unit tests for the pure payroll math. No repositories, no Nest — just the
 * arithmetic and the "Why?" notes the calculation service depends on.
 */
describe('computePayslip', () => {
  const fullAttendance: ComputeInputs = {
    working_days: 26,
    present_days: 26,
    absent_days: 0,
    paid_leave_days: 0,
    unpaid_leave_days: 0,
    late_count: 0,
    late_minutes: 0,
    overtime_hours: 0,
    overtime_amount: 0,
  };

  function ctx(overrides: Partial<ComputeContext> = {}): ComputeContext {
    return {
      basic: 100000,
      workingHoursPerDay: 8,
      components: [],
      inputs: fullAttendance,
      rounding: 'none',
      applyDefaultAbsentDeduction: true,
      ...overrides,
    };
  }

  it('emits BASIC as the first earning line straight from the resolved figure', () => {
    const result = computePayslip(ctx());
    const basicLine = result.lines[0];
    expect(basicLine.label).toBe(BASIC_LINE_LABEL);
    expect(basicLine.type).toBe('earning');
    expect(basicLine.amount).toBe(100000);
    expect(result.basic_salary).toBe(100000);
    // Full attendance, no components → net equals basic.
    expect(result.net_salary).toBe(100000);
    expect(result.total_deductions).toBe(0);
  });

  it('adds include_in_gross earnings into GROSS but leaves others out', () => {
    const components: ComputeComponent[] = [
      {
        component_id: 'c1',
        code: 'HRA',
        name: 'House Rent',
        type: 'earning',
        calculation_type: 'percent_basic',
        amount: 20, // 20% of 100000 = 20000
        formula: null,
        include_in_gross: true,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 1,
      },
      {
        component_id: 'c2',
        code: 'REIMB',
        name: 'Reimbursement',
        type: 'earning',
        calculation_type: 'fixed',
        amount: 5000,
        formula: null,
        include_in_gross: false, // excluded from gross
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 2,
      },
    ];
    const result = computePayslip(ctx({ components }));
    // GROSS = 100000 + 20000 (HRA only) = 120000
    expect(result.gross_salary).toBe(120000);
    // Earnings = basic + HRA + reimbursement
    expect(result.total_earnings).toBe(125000);
    expect(result.net_salary).toBe(125000);
  });

  it('computes a percent_gross deduction against the finalised gross', () => {
    const components: ComputeComponent[] = [
      {
        component_id: 'c1',
        code: 'HRA',
        name: 'House Rent',
        type: 'earning',
        calculation_type: 'percent_basic',
        amount: 50, // 50000 → gross 150000
        formula: null,
        include_in_gross: true,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 1,
      },
      {
        component_id: 'c2',
        code: 'TAX',
        name: 'Income Tax',
        type: 'deduction',
        calculation_type: 'percent_gross',
        amount: 10, // 10% of 150000 = 15000
        formula: null,
        include_in_gross: false,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 2,
      },
    ];
    const result = computePayslip(ctx({ components }));
    expect(result.gross_salary).toBe(150000);
    const tax = result.lines.find((l) => l.code === 'TAX');
    expect(tax?.amount).toBe(15000);
    expect(tax?.calc_note).toContain('10% of GROSS (150000.00)');
    // Net = 150000 earnings − 15000 tax
    expect(result.net_salary).toBe(135000);
  });

  it('applies the default absent deduction as BASIC/WORKING_DAYS × unpaid days', () => {
    const result = computePayslip(
      ctx({
        inputs: {
          ...fullAttendance,
          present_days: 24,
          absent_days: 2,
        },
      }),
    );
    const absence = result.lines.find((l) => l.label === ABSENCE_LINE_LABEL);
    const expected = round2((100000 / 26) * 2);
    expect(absence).toBeDefined();
    expect(absence?.type).toBe('deduction');
    expect(absence?.amount).toBe(expected);
    expect(result.net_salary).toBe(round2(100000 - expected));
  });

  it('folds unpaid leave into the default absence deduction, not paid leave', () => {
    const paidOnly = computePayslip(
      ctx({ inputs: { ...fullAttendance, paid_leave_days: 3 } }),
    );
    expect(
      paidOnly.lines.find((l) => l.label === ABSENCE_LINE_LABEL),
    ).toBeUndefined();
    expect(paidOnly.net_salary).toBe(100000);

    const withUnpaid = computePayslip(
      ctx({ inputs: { ...fullAttendance, unpaid_leave_days: 2 } }),
    );
    const expected = round2((100000 / 26) * 2);
    expect(
      withUnpaid.lines.find((l) => l.label === ABSENCE_LINE_LABEL)?.amount,
    ).toBe(expected);
  });

  it('evaluates a formula component and records a readable note', () => {
    const components: ComputeComponent[] = [
      {
        component_id: 'c1',
        code: 'BONUS',
        name: 'Attendance Bonus',
        type: 'earning',
        calculation_type: 'formula',
        amount: 0,
        formula: 'DAILY_RATE * PRESENT_DAYS * 0.05',
        include_in_gross: false,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 1,
      },
    ];
    const result = computePayslip(ctx({ components }));
    const line = result.lines.find((l) => l.code === 'BONUS');
    const expected = round2((100000 / 26) * 26 * 0.05);
    expect(line?.amount).toBe(expected);
    expect(line?.calc_note).toContain('Formula');
  });

  it('never throws on a bad formula — yields 0 with a warning', () => {
    const components: ComputeComponent[] = [
      {
        component_id: 'c1',
        code: 'BROKEN',
        name: 'Broken Rule',
        type: 'deduction',
        calculation_type: 'formula',
        amount: 0,
        formula: 'SALARY * 2', // unknown variable
        include_in_gross: false,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 1,
      },
    ];
    const result = computePayslip(ctx({ components }));
    const line = result.lines.find((l) => l.code === 'BROKEN');
    expect(line?.amount).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/Broken Rule/);
  });

  it('warns when basic is zero and applies no absence deduction', () => {
    const result = computePayslip(
      ctx({
        basic: 0,
        inputs: { ...fullAttendance, absent_days: 5 },
      }),
    );
    expect(result.warnings.some((w) => /No base salary/i.test(w))).toBe(true);
    expect(
      result.lines.find((l) => l.label === ABSENCE_LINE_LABEL),
    ).toBeUndefined();
    expect(result.net_salary).toBe(0);
  });

  it('honours the rounding mode on the net figure', () => {
    const components: ComputeComponent[] = [
      {
        component_id: 'c1',
        code: 'ODD',
        name: 'Odd Allowance',
        type: 'earning',
        calculation_type: 'fixed',
        amount: 0.4,
        formula: null,
        include_in_gross: true,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 1,
      },
    ];
    expect(
      computePayslip(ctx({ components, rounding: 'none' })).net_salary,
    ).toBe(100000.4);
    expect(
      computePayslip(ctx({ components, rounding: 'nearest' })).net_salary,
    ).toBe(100000);
    expect(computePayslip(ctx({ components, rounding: 'up' })).net_salary).toBe(
      100001,
    );
    expect(
      computePayslip(ctx({ components, rounding: 'down' })).net_salary,
    ).toBe(100000);
  });

  it('orders lines by display_order with basic pinned first', () => {
    const components: ComputeComponent[] = [
      {
        component_id: 'c2',
        code: 'B',
        name: 'Second',
        type: 'earning',
        calculation_type: 'fixed',
        amount: 100,
        formula: null,
        include_in_gross: true,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 5,
      },
      {
        component_id: 'c1',
        code: 'A',
        name: 'First',
        type: 'earning',
        calculation_type: 'fixed',
        amount: 100,
        formula: null,
        include_in_gross: true,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 2,
      },
    ];
    const result = computePayslip(ctx({ components }));
    expect(result.lines[0].label).toBe(BASIC_LINE_LABEL);
    expect(result.lines[1].code).toBe('A');
    expect(result.lines[2].code).toBe('B');
  });

  // ---- Phase 2 rule integration ----------------------------------------
  //
  // Every Phase 2 field on ComputeContext is optional. The contract is that a
  // tenant who configures no rules keeps the exact Phase 1 result, and that
  // when rules do fire, earnings land before GROSS is finalised while
  // deductions land after — otherwise overtime and bonus would silently drop
  // out of percent_gross components.
  describe('rule integration', () => {
    const earning: ComputeComponent = {
      component_id: 'c1',
      code: 'HRA',
      name: 'House Rent',
      type: 'earning',
      calculation_type: 'percent_basic',
      amount: 50,
      formula: null,
      include_in_gross: true,
      is_taxable: true,
      include_in_overtime: false,
      include_in_leave_deduction: false,
      include_in_bonus: false,
      display_order: 1,
    };

    it('produces the Phase 1 result when no rules are configured', () => {
      const base = computePayslip(ctx({ components: [earning] }));
      const withNulls = computePayslip(
        ctx({
          components: [earning],
          overtimeRule: null,
          bonusRule: null,
          lateRule: null,
          repeatedLateRule: null,
          absentRule: null,
          leaveRule: null,
          taxRule: null,
          loanDeduction: null,
        }),
      );

      expect(withNulls).toEqual(base);
      expect(withNulls.gross_salary).toBe(150000);
      expect(withNulls.net_salary).toBe(150000);
    });

    it('counts a rule-driven bonus toward gross', () => {
      const withoutBonus = computePayslip(ctx({ components: [earning] }));
      const withBonus = computePayslip(
        ctx({
          components: [earning],
          bonusRule: {
            name: 'Eid Bonus',
            trigger: 'flat',
            amount: 20000,
            formula: null,
            taxable: false,
          },
        }),
      );

      expect(withBonus.gross_salary).toBe(withoutBonus.gross_salary + 20000);
      expect(withBonus.net_salary).toBe(withoutBonus.net_salary + 20000);
    });

    it('takes a loan repayment out of net without touching gross', () => {
      const withoutLoan = computePayslip(ctx({ components: [earning] }));
      const withLoan = computePayslip(
        ctx({
          components: [earning],
          loanDeduction: {
            amount: 5000,
            note: 'Installment 1 of Motorcycle advance = 5000.00.',
          },
        }),
      );

      expect(withLoan.gross_salary).toBe(withoutLoan.gross_salary);
      expect(withLoan.total_deductions).toBe(
        withoutLoan.total_deductions + 5000,
      );
      expect(withLoan.net_salary).toBe(withoutLoan.net_salary - 5000);
    });

    it('gives every rule-driven line a "Why?" note', () => {
      const result = computePayslip(
        ctx({
          components: [earning],
          bonusRule: {
            name: 'Eid Bonus',
            trigger: 'flat',
            amount: 20000,
            formula: null,
            taxable: false,
          },
          loanDeduction: {
            amount: 5000,
            note: 'Installment 1 of Motorcycle advance = 5000.00.',
          },
        }),
      );

      // Both synthetic rule lines are present, and nothing on the payslip is
      // left unexplained — the "Why?" expander has content for every row.
      expect(result.lines.map((l) => l.code)).toEqual(
        expect.arrayContaining(['BONUS', 'LOAN']),
      );
      for (const line of result.lines) {
        expect(line.calc_note.trim().length).toBeGreaterThan(0);
      }
    });
  });

  // Phase 3. The whole point of the reimbursement line is what it does NOT
  // touch: reimbursing a receipt is repayment, not income, so gross and tax
  // must be identical with and without it. Only net moves.
  describe('reimbursement (Phase 3)', () => {
    const taxable: ComputeComponent = {
      component_id: 'c1',
      code: 'HRA',
      name: 'House Rent',
      type: 'earning',
      calculation_type: 'percent_basic',
      amount: 50, // 50000 → gross 150000
      formula: null,
      include_in_gross: true,
      is_taxable: true,
      include_in_overtime: false,
      include_in_leave_deduction: false,
      include_in_bonus: false,
      display_order: 1,
    };

    // A single 10% bracket keeps the arithmetic obvious: any change in the
    // taxable base would move the tax line by a visible amount.
    const taxRule = {
      name: 'Flat 10%',
      slabs: [
        {
          lower_bound: 0,
          upper_bound: null,
          base_tax: 0,
          rate_percent: 10,
        },
      ],
      annualize: true,
      periods_per_year: 12,
    };

    it('produces the Phase 2 result when no claims are approved', () => {
      const base = computePayslip(ctx({ components: [taxable], taxRule }));
      const withNulls = computePayslip(
        ctx({ components: [taxable], taxRule, reimbursement: null }),
      );
      const withZero = computePayslip(
        ctx({
          components: [taxable],
          taxRule,
          reimbursement: { total: 0, count: 0 },
        }),
      );

      expect(withNulls).toEqual(base);
      expect(withZero).toEqual(base);
      expect(
        base.lines.some((l) => l.label === REIMBURSEMENT_LINE_LABEL),
      ).toBe(false);
    });

    it('leaves gross and tax untouched and raises net by the claim total', () => {
      const without = computePayslip(ctx({ components: [taxable], taxRule }));
      const withClaims = computePayslip(
        ctx({
          components: [taxable],
          taxRule,
          reimbursement: {
            total: 6500,
            count: 2,
            detail: 'Travel 4500.00 + Internet 2000.00',
          },
        }),
      );

      const taxOf = (r: typeof without) =>
        r.lines.find((l) => l.label === TAX_LINE_LABEL)?.amount ?? 0;

      // Not income: the taxable base never sees it.
      expect(withClaims.gross_salary).toBe(without.gross_salary);
      expect(taxOf(withClaims)).toBe(taxOf(without));
      expect(taxOf(withClaims)).toBeGreaterThan(0); // the tax line is real
      expect(withClaims.total_deductions).toBe(without.total_deductions);

      // But it is money in hand: earnings and net rise by exactly the total.
      expect(withClaims.total_earnings).toBe(
        round2(without.total_earnings + 6500),
      );
      expect(withClaims.net_salary).toBe(round2(without.net_salary + 6500));
    });

    it('emits one explained earning line naming the claims', () => {
      const result = computePayslip(
        ctx({
          components: [taxable],
          taxRule,
          reimbursement: {
            total: 6500,
            count: 2,
            detail: 'Travel 4500.00 + Internet 2000.00',
          },
        }),
      );

      const line = result.lines.find(
        (l) => l.label === REIMBURSEMENT_LINE_LABEL,
      );
      expect(line).toBeDefined();
      expect(line!.type).toBe('earning');
      expect(line!.amount).toBe(6500);
      // The "Why?" note has to say how many claims, which ones, and why the
      // amount is untaxed — that is the employee's explanation of their net.
      expect(line!.calc_note).toContain('2 approved claims');
      expect(line!.calc_note).toContain('Travel 4500.00 + Internet 2000.00');
      expect(line!.calc_note).toContain('not taxed');

      // Emitted after gross is settled, so it sorts below the salary lines.
      const labels = result.lines.map((l) => l.label);
      expect(labels.indexOf(REIMBURSEMENT_LINE_LABEL)).toBeGreaterThan(
        labels.indexOf(BASIC_LINE_LABEL),
      );
    });

    it('is not swallowed by a percent_gross deduction', () => {
      const pf: ComputeComponent = {
        component_id: 'c2',
        code: 'PF',
        name: 'Provident Fund',
        type: 'deduction',
        calculation_type: 'percent_gross',
        amount: 10,
        formula: null,
        include_in_gross: false,
        is_taxable: false,
        include_in_overtime: false,
        include_in_leave_deduction: false,
        include_in_bonus: false,
        display_order: 2,
      };

      const without = computePayslip(ctx({ components: [taxable, pf] }));
      const withClaims = computePayslip(
        ctx({
          components: [taxable, pf],
          reimbursement: { total: 6500, count: 1, detail: 'Travel 6500.00' },
        }),
      );

      // Percent-of-gross components read the same gross either way, so the
      // employee is not charged PF on their own expense refund.
      expect(withClaims.total_deductions).toBe(without.total_deductions);
      expect(withClaims.net_salary).toBe(round2(without.net_salary + 6500));
    });
  });
});
