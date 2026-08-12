import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { PayrollPeriod } from '../payroll-periods/payroll-periods.entity';
import { PayrollSettings } from '../payroll-settings/payroll-settings.entity';
import { Payslip, PayslipLine } from '../payslips/payslips.entity';
import {
  SalaryStructureAssignment,
  SalaryStructureComponent,
  EmployeeComponentOverride,
} from '../salary-structures/salary-structures.entity';
import { HolidaysService } from '../holidays/holidays.service';
import {
  CalculationType,
  ComponentType,
  ScopeType,
  SCOPE_PRIORITY,
} from './payroll.constants';
import {
  computePayslip,
  ComputeComponent,
  ComputeInputs,
  ComputedResult,
  RoundingMode,
  OvertimeRuleResolved,
  BonusRuleResolved,
  LateRuleResolved,
  RepeatedLateRuleResolved,
  AbsentRuleResolved,
  LeaveRuleResolved,
  TaxRuleResolved,
  LoanDeductionResolved,
  ReimbursementResolved,
} from './payroll-calculation';
import { periodsPerYear } from './tax-calculation';
import { derivePunctuality } from '../attendance/attendance-punctuality';
import {
  PayrollRuleResolverService,
  ScopeIdMap,
  ResolvedRules,
} from '../payroll-rules/payroll-rule-resolver.service';
import {
  OvertimeRuleConfig,
  BonusRuleConfig,
  LateRuleConfig,
  RepeatedLateRuleConfig,
  AbsentRuleConfig,
  LeaveRuleConfig,
} from '../payroll-rules/payroll-rule.constants';
import { PayrollTaxService } from '../payroll-tax/payroll-tax.service';
import { PayrollLoansService } from '../payroll-loans/payroll-loans.service';
import { ReimbursementsService } from '../reimbursements/reimbursements.service';

/** The full preview payload returned to the UI (and snapshotted on generate). */
export interface PayslipPreview extends ComputedResult {
  user_id: string;
  employee_name: string;
  employee_code: string;
  period_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  currency: string;
  structure_id: string | null;
  structure_name: string | null;
  inputs: ComputeInputs;
  /**
   * Claims the Reimbursement line is paying (Phase 3). Carried on the preview so
   * `persist` can flip exactly these to `paid` without re-querying, and so the
   * snapshot records which receipts a payslip settled.
   */
  reimbursement_ids: string[];
}

/** Summary of a whole-period run. */
export interface PeriodRunResult {
  period_id: string;
  generated: number;
  skipped: number;
  warnings: string[];
}

/**
 * Turns configuration + attendance into payslips (spec §11/§14).
 *
 * This service owns all the database work the pure `computePayslip` math does
 * not: resolving which salary structure applies to an employee for a period by
 * scope priority and effective date, folding in structure- and employee-level
 * component overrides, gathering the period's attendance/leave/overtime inputs,
 * and (on generate) persisting the payslip with a full `calculation_json`
 * snapshot so historical payslips never move when rules change later.
 *
 * Two entry points:
 *   - `preview(userId, periodId)` computes and returns the breakdown without
 *     writing anything — the "Preview with Why?" screen.
 *   - `generate(...)` / `generateForPeriod(...)` persist Payslip + lines.
 */
@Injectable()
export class PayrollCalculationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Attendance)
    private readonly attendanceRepository: Repository<Attendance>,
    @InjectRepository(LeaveRequest)
    private readonly leaveRepository: Repository<LeaveRequest>,
    @InjectRepository(PayrollPeriod)
    private readonly periodRepository: Repository<PayrollPeriod>,
    @InjectRepository(PayrollSettings)
    private readonly settingsRepository: Repository<PayrollSettings>,
    @InjectRepository(SalaryStructureAssignment)
    private readonly assignmentRepository: Repository<SalaryStructureAssignment>,
    @InjectRepository(SalaryStructureComponent)
    private readonly structureComponentRepository: Repository<SalaryStructureComponent>,
    @InjectRepository(EmployeeComponentOverride)
    private readonly overrideRepository: Repository<EmployeeComponentOverride>,
    @InjectRepository(Payslip)
    private readonly payslipRepository: Repository<Payslip>,
    @InjectRepository(PayslipLine)
    private readonly payslipLineRepository: Repository<PayslipLine>,
    private readonly holidaysService: HolidaysService,
    private readonly ruleResolver: PayrollRuleResolverService,
    private readonly taxService: PayrollTaxService,
    private readonly loansService: PayrollLoansService,
    private readonly reimbursementsService: ReimbursementsService,
  ) {}

  // ---- Public entry points -------------------------------------------------

  /** Compute an employee's payslip for a period without persisting it. */
  async preview(userId: string, periodId: string): Promise<PayslipPreview> {
    const period = await this.getPeriod(periodId);
    const settings = await this.getSettings();
    const user = await this.getUser(userId);
    return this.build(user, period, settings);
  }

  /**
   * Compute and persist one employee's payslip for a period. Re-running for the
   * same employee/period replaces the previous payslip (and its lines) so a run
   * is idempotent.
   */
  async generate(
    userId: string,
    periodId: string,
  ): Promise<PayslipPreview & { payslip_id: string }> {
    const period = await this.getPeriod(periodId);
    const settings = await this.getSettings();
    const user = await this.getUser(userId);
    const preview = await this.build(user, period, settings);
    const payslipId = await this.persist(preview);
    return { ...preview, payslip_id: payslipId };
  }

  /**
   * Generate payslips for every active employee in a period. One employee's
   * failure never aborts the run — it is recorded as a warning and the rest
   * continue. Returns a summary the period workflow reports back to HR.
   */
  async generateForPeriod(periodId: string): Promise<PeriodRunResult> {
    const period = await this.getPeriod(periodId);
    const settings = await this.getSettings();
    const employees = await this.userRepository.find({
      where: { status: true },
      relations: { department: true, designation: true, jobCategory: true },
    });

    const warnings: string[] = [];
    let generated = 0;
    let skipped = 0;

    for (const employee of employees) {
      try {
        const preview = await this.build(employee, period, settings);
        await this.persist(preview);
        generated += 1;
        for (const w of preview.warnings) {
          warnings.push(`${preview.employee_code}: ${w}`);
        }
      } catch (err) {
        skipped += 1;
        const message = err instanceof Error ? err.message : 'Unknown error';
        warnings.push(
          `${employee.employee_code ?? employee.user_id}: ${message}`,
        );
      }
    }

    return { period_id: periodId, generated, skipped, warnings };
  }

  // ---- Core build ----------------------------------------------------------

  private async build(
    user: User,
    period: PayrollPeriod,
    settings: PayrollSettings,
  ): Promise<PayslipPreview> {
    const periodStart = new Date(period.period_start);
    const periodEnd = new Date(period.period_end);

    const { assignment, structureName } = await this.resolveAssignment(
      user,
      periodStart,
      periodEnd,
    );
    const components = assignment
      ? await this.resolveComponents(
          assignment.structure_id,
          user.user_id,
          periodStart,
          periodEnd,
        )
      : [];

    const basic =
      assignment?.base_salary != null
        ? assignment.base_salary
        : (user.salary ?? 0);

    // Phase 2: resolve the rules, tax config, and loan installment that apply to
    // this employee for the period. All are optional — with none configured the
    // engine produces the exact Phase 1 result.
    const scopeIds = this.buildScopeIds(user);
    const rules = await this.ruleResolver.resolveRules(scopeIds, periodStart);
    const overtimeRule = this.resolveOvertimeRule(rules);
    const taxRule = await this.resolveTaxRule(settings, periodStart);
    const loanDeduction = await this.resolveLoanDeduction(
      user.user_id,
      period.period_id,
    );

    // Phase 3: approved expense claims dated inside the period. Read-only here —
    // nothing is marked paid until `persist` commits a payslip.
    const claims = await this.reimbursementsService.resolveForPeriod(
      user.user_id,
      periodStart,
      periodEnd,
      period.period_id,
    );
    const reimbursement: ReimbursementResolved | null =
      claims.total > 0
        ? { total: claims.total, count: claims.count, detail: claims.detail }
        : null;

    const inputs = await this.gatherInputs(
      user,
      period,
      settings,
      periodStart,
      periodEnd,
      basic,
      overtimeRule != null,
    );

    const computed = computePayslip({
      basic,
      workingHoursPerDay: settings.working_hours_per_day,
      components,
      inputs,
      rounding: (settings.rounding as RoundingMode) ?? 'nearest',
      applyDefaultAbsentDeduction: true,
      overtimeRule,
      bonusRule: this.resolveBonusRule(rules),
      lateRule: this.resolveLateRule(rules),
      repeatedLateRule: this.resolveRepeatedLateRule(rules),
      absentRule: this.resolveAbsentRule(rules),
      leaveRule: this.resolveLeaveRule(rules),
      taxRule,
      loanDeduction,
      reimbursement,
    });

    return {
      ...computed,
      user_id: user.user_id,
      employee_name: `${user.first_name} ${user.last_name}`.trim(),
      employee_code: user.employee_code,
      period_id: period.period_id,
      period_name: period.name,
      period_start: this.toIso(periodStart),
      period_end: this.toIso(periodEnd),
      currency: settings.currency,
      structure_id: assignment?.structure_id ?? null,
      structure_name: structureName,
      inputs,
      reimbursement_ids: claims.ids,
    };
  }

  // ---- Scope-priority structure resolution ---------------------------------

  /**
   * Pick the salary structure assignment that applies to this employee for the
   * period: the highest-priority scope (employee > designation > department >
   * job_category > company) whose effective window overlaps the period. Ties
   * within a scope are broken by the most recent effective_from.
   */
  private async resolveAssignment(
    user: User,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{
    assignment: SalaryStructureAssignment | null;
    structureName: string | null;
  }> {
    const assignments = await this.assignmentRepository.find({
      where: { is_active: true },
    });

    const scopeId = this.buildScopeIds(user);

    const matches = assignments
      .filter((a) => a.structure?.is_active !== false)
      .filter((a) =>
        this.isEffective(
          a.effective_from,
          a.effective_to,
          periodStart,
          periodEnd,
        ),
      )
      .filter((a) => {
        const type = a.scope_type as ScopeType;
        if (type === 'company') return true;
        return a.scope_id != null && a.scope_id === scopeId[type];
      });

    if (matches.length === 0) {
      return { assignment: null, structureName: null };
    }

    matches.sort((a, b) => {
      const byPriority =
        SCOPE_PRIORITY[b.scope_type as ScopeType] -
        SCOPE_PRIORITY[a.scope_type as ScopeType];
      if (byPriority !== 0) return byPriority;
      return this.effectiveFromTime(b) - this.effectiveFromTime(a);
    });

    const winner = matches[0];
    return {
      assignment: winner,
      structureName: winner.structure?.name ?? null,
    };
  }

  /**
   * Resolve a structure's components into the effective calculation for one
   * employee: start from the component definition, layer the structure-level
   * override, then the employee-level override (narrowest wins). Inactive or
   * out-of-effect component definitions are dropped.
   */
  private async resolveComponents(
    structureId: string,
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ComputeComponent[]> {
    const memberships = await this.structureComponentRepository.find({
      where: { structure_id: structureId },
    });

    const overrides = await this.overrideRepository.find({
      where: { user_id: userId },
    });
    // An employee can hold more than one effective override for the same
    // component — e.g. a standing one set in the structure builder plus a
    // period-scoped one entered on the Run Payroll grid. "Narrowest wins"
    // (see the doc comment above): a bounded window beats an open one, and a
    // later-starting window beats an earlier one, so a single month's edit
    // reliably overrides the standing figure without a coin-flip on insertion
    // order.
    const overrideByComponent = new Map<string, EmployeeComponentOverride>();
    for (const o of overrides) {
      if (
        !this.isEffective(
          o.effective_from,
          o.effective_to,
          periodStart,
          periodEnd,
        )
      ) {
        continue;
      }
      const current = overrideByComponent.get(o.component_id);
      if (!current || this.isNarrowerOverride(o, current)) {
        overrideByComponent.set(o.component_id, o);
      }
    }

    const resolved: ComputeComponent[] = [];
    for (const membership of memberships) {
      const base = membership.component;
      if (!base || base.is_active === false) continue;
      if (
        !this.isEffective(
          base.effective_from,
          base.effective_to,
          periodStart,
          periodEnd,
        )
      ) {
        continue;
      }

      const employeeOverride = overrideByComponent.get(membership.component_id);

      const calculation_type = (employeeOverride?.override_calculation_type ??
        membership.override_calculation_type ??
        base.calculation_type) as CalculationType;
      const amount =
        employeeOverride?.override_amount ??
        membership.override_amount ??
        base.amount;
      const formula =
        employeeOverride?.override_formula ??
        membership.override_formula ??
        base.formula ??
        null;

      resolved.push({
        component_id: base.component_id,
        code: base.code,
        name: base.name,
        type: base.type as ComponentType,
        calculation_type,
        amount,
        formula,
        include_in_gross: base.include_in_gross,
        is_taxable: base.is_taxable,
        include_in_overtime: base.include_in_overtime,
        include_in_leave_deduction: base.include_in_leave_deduction,
        include_in_bonus: base.include_in_bonus,
        display_order: membership.display_order || base.display_order,
      });
    }

    return resolved;
  }

  // ---- Attendance / leave / overtime inputs --------------------------------

  private async gatherInputs(
    user: User,
    period: PayrollPeriod,
    settings: PayrollSettings,
    periodStart: Date,
    periodEnd: Date,
    basic: number,
    overtimeRuleActive: boolean,
  ): Promise<ComputeInputs> {
    const holidaySet = await this.holidaysService.getHolidayDateSet(
      periodStart,
      periodEnd,
      user.department?.department_id ?? null,
    );

    const attendance = await this.attendanceRepository.find({
      where: {
        user: { user_id: user.user_id },
        attendance_date: Between(periodStart, periodEnd),
      },
    });

    let present = 0;
    let absent = 0;
    let lateCount = 0;
    let lateMinutes = 0;
    let overtimeHours = 0;

    // Overtime pay is opt-in (spec): gather hours only when the settings switch
    // or an active overtime rule turns it on.
    const overtimeOn = settings.overtime_enabled || overtimeRuleActive;

    for (const record of attendance) {
      switch (record.attendance_status) {
        case 'Present':
          present += 1;
          break;
        case 'Late':
          present += 1;
          lateCount += 1;
          break;
        case 'Half-Day':
          present += 0.5;
          absent += 0.5;
          break;
        case 'Absent':
          absent += 1;
          break;
        default:
          break; // On Leave / Non-Working handled elsewhere or ignored
      }

      // Late minutes against the shift start (Phase 2 LATE_MINUTES). The late
      // rule applies its own grace on top, so raw variance is what we sum.
      if (record.check_in && record.shift?.start_time) {
        const { check_in_variance_minutes } = derivePunctuality({
          checkIn: record.check_in,
          shiftStart: record.shift.start_time,
          shiftEnd: record.shift.end_time,
          graceMinutes: record.shift.grace_period_minutes,
        });
        if (check_in_variance_minutes && check_in_variance_minutes > 0) {
          lateMinutes += check_in_variance_minutes;
        }
      }

      // Overtime counts only when enabled and, per spec, only on non-working
      // days / government holidays.
      if (overtimeOn && record.is_overtime) {
        const iso = this.toIso(new Date(record.attendance_date));
        const isNonWorking =
          record.attendance_status === 'Non-Working' ||
          holidaySet.has(iso) ||
          this.isWeekend(new Date(record.attendance_date));
        if (isNonWorking) {
          overtimeHours += Number(record.overtime_hours ?? 0);
        }
      }
    }

    const { paidLeave, unpaidLeave } = await this.gatherLeave(
      user.user_id,
      periodStart,
      periodEnd,
    );

    const workingDays = this.resolveWorkingDays(
      period,
      settings,
      periodStart,
      periodEnd,
      holidaySet,
    );

    const dailyRate = workingDays > 0 ? basic / workingDays : 0;
    const hourlyRate =
      settings.working_hours_per_day > 0
        ? dailyRate / settings.working_hours_per_day
        : 0;
    const overtimeAmount =
      Math.round((overtimeHours * hourlyRate + Number.EPSILON) * 100) / 100;

    return {
      working_days: workingDays,
      present_days: present,
      absent_days: absent,
      paid_leave_days: paidLeave,
      unpaid_leave_days: unpaidLeave,
      late_count: lateCount,
      late_minutes: Math.round(lateMinutes),
      overtime_hours: overtimeHours,
      overtime_amount: overtimeAmount,
    };
  }

  /**
   * Approved leave overlapping the period, split into paid vs unpaid by the
   * leave type. A leave with no linked type is treated as paid (the catalog
   * default). Days use the stored `days_count` when present, falling back to
   * the inclusive day span — refined to per-period clamping in Phase 2.
   */
  private async gatherLeave(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ paidLeave: number; unpaidLeave: number }> {
    const leaves = await this.leaveRepository
      .createQueryBuilder('leave')
      .leftJoinAndSelect('leave.leaveTypeRef', 'leaveType')
      .where('leave.user_id = :userId', { userId })
      .andWhere('leave.status = :status', { status: 'Approved' })
      .andWhere('leave.start_date <= :end', { end: this.toIso(periodEnd) })
      .andWhere('leave.end_date >= :start', { start: this.toIso(periodStart) })
      .getMany();

    let paidLeave = 0;
    let unpaidLeave = 0;

    for (const leave of leaves) {
      const days =
        leave.days_count != null
          ? Number(leave.days_count)
          : this.inclusiveDays(
              new Date(leave.start_date),
              new Date(leave.end_date),
            );
      const isPaid = leave.leaveTypeRef?.is_paid ?? true;
      if (isPaid) {
        paidLeave += days;
      } else {
        unpaidLeave += days;
      }
    }

    return {
      paidLeave: Math.round((paidLeave + Number.EPSILON) * 100) / 100,
      unpaidLeave: Math.round((unpaidLeave + Number.EPSILON) * 100) / 100,
    };
  }

  /**
   * Working days for the period. The period's own `working_days` wins when set
   * (HR can override per run); otherwise it is derived from settings:
   *   fixed      → the configured constant
   *   calendar   → every day in the range
   *   attendance → weekdays in the range minus holidays (default)
   */
  private resolveWorkingDays(
    period: PayrollPeriod,
    settings: PayrollSettings,
    periodStart: Date,
    periodEnd: Date,
    holidaySet: Set<string>,
  ): number {
    if (period.working_days && period.working_days > 0) {
      return period.working_days;
    }
    switch (settings.working_days_source) {
      case 'fixed':
        return settings.fixed_working_days;
      case 'calendar':
        return this.inclusiveDays(periodStart, periodEnd);
      case 'attendance':
      default:
        return this.scheduledWorkingDays(periodStart, periodEnd, holidaySet);
    }
  }

  // ---- Phase 2 rule resolution ---------------------------------------------

  /** The employee's scope ids, keyed by scope type (company is always null). */
  private buildScopeIds(user: User): ScopeIdMap {
    return {
      company: null,
      job_category: user.jobCategory?.job_category_id ?? null,
      department: user.department?.department_id ?? null,
      designation: user.designation?.designation_id ?? null,
      employee: user.user_id,
    };
  }

  /** Overtime rule (spec §7) — only when present and its master switch is on. */
  private resolveOvertimeRule(
    rules: ResolvedRules,
  ): OvertimeRuleResolved | null {
    const rule = rules.overtime;
    if (!rule) return null;
    const config = (rule.config ?? {}) as unknown as OvertimeRuleConfig;
    if (!config.enabled) return null;
    return {
      rate_multiplier: config.rate_multiplier ?? 1,
      formula: config.formula ?? null,
      cap_hours:
        config.cap_hours && config.cap_hours > 0 ? config.cap_hours : null,
      taxable: true,
    };
  }

  private resolveBonusRule(rules: ResolvedRules): BonusRuleResolved | null {
    const rule = rules.bonus;
    if (!rule) return null;
    const config = (rule.config ?? {}) as unknown as BonusRuleConfig;
    return {
      name: rule.name,
      trigger: config.trigger,
      amount: config.amount ?? 0,
      formula: config.formula ?? null,
      taxable: config.taxable ?? true,
    };
  }

  private resolveLateRule(rules: ResolvedRules): LateRuleResolved | null {
    const rule = rules.late;
    if (!rule) return null;
    const config = (rule.config ?? {}) as unknown as LateRuleConfig;
    return {
      name: rule.name,
      grace_minutes: config.grace_minutes ?? 0,
      unit: config.unit,
      amount: config.amount ?? 0,
      formula: config.formula ?? null,
    };
  }

  private resolveRepeatedLateRule(
    rules: ResolvedRules,
  ): RepeatedLateRuleResolved | null {
    const rule = rules.repeated_late;
    if (!rule) return null;
    const config = (rule.config ?? {}) as unknown as RepeatedLateRuleConfig;
    return {
      name: rule.name,
      threshold_count: config.threshold_count ?? 0,
      penalty_days: config.penalty_days ?? 0,
    };
  }

  private resolveAbsentRule(rules: ResolvedRules): AbsentRuleResolved | null {
    const rule = rules.absent;
    if (!rule) return null;
    const config = (rule.config ?? {}) as unknown as AbsentRuleConfig;
    return {
      name: rule.name,
      mode: config.mode,
      multiplier: config.multiplier ?? 1,
      formula: config.formula ?? null,
    };
  }

  private resolveLeaveRule(rules: ResolvedRules): LeaveRuleResolved | null {
    const rule = rules.leave;
    if (!rule) return null;
    const config = (rule.config ?? {}) as unknown as LeaveRuleConfig;
    return {
      unpaid_leave_deduction: config.unpaid_leave_deduction ?? 'per_day',
      multiplier: config.multiplier ?? 1,
    };
  }

  /** The active income-tax config (spec §10) as engine-ready slabs, or null. */
  private async resolveTaxRule(
    settings: PayrollSettings,
    onDate: Date,
  ): Promise<TaxRuleResolved | null> {
    const config = await this.taxService.getActiveConfig(onDate);
    if (!config || !config.slabs || config.slabs.length === 0) return null;
    const slabs = [...config.slabs]
      .sort((a, b) => a.lower_bound - b.lower_bound)
      .map((s) => ({
        lower_bound: Number(s.lower_bound),
        upper_bound: s.upper_bound == null ? null : Number(s.upper_bound),
        base_tax: Number(s.base_tax),
        rate_percent: Number(s.rate_percent),
      }));
    return {
      name: config.name,
      slabs,
      annualize: config.annualize,
      periods_per_year: periodsPerYear(settings.frequency),
    };
  }

  /**
   * The loan installment (spec §9) due this period, read-only for the snapshot.
   * The actual balance decrement happens in `persist` via `applyDeduction`, so
   * a preview never mutates loan state.
   */
  private async resolveLoanDeduction(
    userId: string,
    periodId: string,
  ): Promise<LoanDeductionResolved | null> {
    const result = await this.loansService.resolveDeduction(userId, periodId);
    if (result.amount <= 0) return null;
    const note = result.lines
      .map(
        (l) =>
          `${l.loan_name}: ${l.amount.toFixed(2)} (outstanding ` +
          `${l.outstanding_before.toFixed(2)} → ${l.outstanding_after.toFixed(2)})`,
      )
      .join('; ');
    return { amount: result.amount, note: note || 'Loan installment.' };
  }

  // ---- Persistence ---------------------------------------------------------
  /**
   * Save a preview as a payslip + lines, replacing any prior payslip for the
   * same employee/period. The whole preview is stored in `calculation_json` so
   * the payslip renders from its snapshot forever after.
   */
  private async persist(preview: PayslipPreview): Promise<string> {
    const existing = await this.payslipRepository.findOne({
      where: { period_id: preview.period_id, user_id: preview.user_id },
    });
    if (existing) {
      // Cascade removes the old lines.
      await this.payslipRepository.delete({ payslip_id: existing.payslip_id });
    }

    const payslip = this.payslipRepository.create({
      period_id: preview.period_id,
      user_id: preview.user_id,
      structure_id: preview.structure_id,
      basic_salary: preview.basic_salary,
      gross_salary: preview.gross_salary,
      total_earnings: preview.total_earnings,
      total_deductions: preview.total_deductions,
      net_salary: preview.net_salary,
      working_days: preview.inputs.working_days,
      present_days: preview.inputs.present_days,
      absent_days: preview.inputs.absent_days,
      paid_leave_days: preview.inputs.paid_leave_days,
      unpaid_leave_days: preview.inputs.unpaid_leave_days,
      late_count: preview.inputs.late_count,
      overtime_hours: preview.inputs.overtime_hours,
      overtime_amount: preview.inputs.overtime_amount,
      status: 'generated',
      calculation_json: preview,
    });
    const saved = await this.payslipRepository.save(payslip);

    const lines = preview.lines.map((line, index) =>
      this.payslipLineRepository.create({
        payslip_id: saved.payslip_id,
        component_id: line.component_id,
        label: line.label,
        type: line.type,
        amount: line.amount,
        calc_note: line.calc_note,
        display_order: line.display_order === -1 ? index : line.display_order,
      }),
    );
    await this.payslipLineRepository.save(lines);

    // Record loan repayments now that the payslip is committed. Idempotent per
    // (loan_id, period_id): re-generating a period never double-charges, and a
    // preview (which never reaches persist) leaves loan balances untouched.
    await this.loansService.applyDeduction(preview.user_id, preview.period_id);

    // Same contract for expense claims: only a committed payslip flips a claim
    // to `paid`, stamped with the period and payslip that settled it. Re-running
    // a period re-marks the same rows (resolveForPeriod deliberately re-picks
    // claims this period already paid), so a regenerate cannot double-pay.
    // Claims released first, so a claim dropped from the recomputed payslip
    // (approval reversed, date edited) does not stay stranded as `paid`.
    await this.reimbursementsService.releaseForPeriod(
      preview.period_id,
      preview.user_id,
    );
    await this.reimbursementsService.markPaid(
      preview.reimbursement_ids,
      preview.period_id,
      saved.payslip_id,
    );

    return saved.payslip_id;
  }

  // ---- Loaders -------------------------------------------------------------

  private async getPeriod(periodId: string): Promise<PayrollPeriod> {
    const period = await this.periodRepository.findOne({
      where: { period_id: periodId },
    });
    if (!period) {
      throw new NotFoundException(`Payroll period "${periodId}" not found.`);
    }
    return period;
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { user_id: userId },
      relations: { department: true, designation: true, jobCategory: true },
    });
    if (!user) {
      throw new NotFoundException(`Employee "${userId}" not found.`);
    }
    return user;
  }

  private async getSettings(): Promise<PayrollSettings> {
    const settings = await this.settingsRepository.findOne({
      where: { id: 1 },
    });
    if (!settings) {
      throw new NotFoundException(
        'Payroll settings have not been initialised. Run the payroll migrations.',
      );
    }
    return settings;
  }

  // ---- Date helpers --------------------------------------------------------

  /** A row is in effect for the period when its window overlaps it. */
  private isEffective(
    from: Date | string | null | undefined,
    to: Date | string | null | undefined,
    periodStart: Date,
    periodEnd: Date,
  ): boolean {
    if (from && new Date(from) > periodEnd) return false;
    if (to && new Date(to) < periodStart) return false;
    return true;
  }

  /**
   * Tie-break between two overrides that are both effective for a period:
   * the narrower (more specific) one wins. A bounded window is narrower than
   * an open-ended one; between two equally-bounded windows the later start
   * wins. This makes a period-scoped grid edit reliably beat a standing
   * override without depending on row insertion order.
   */
  private isNarrowerOverride(
    candidate: EmployeeComponentOverride,
    current: EmployeeComponentOverride,
  ): boolean {
    const rank = (o: EmployeeComponentOverride): number =>
      (o.effective_from ? 1 : 0) + (o.effective_to ? 1 : 0);
    const candidateRank = rank(candidate);
    const currentRank = rank(current);
    if (candidateRank !== currentRank) return candidateRank > currentRank;
    const candidateStart = candidate.effective_from
      ? new Date(candidate.effective_from).getTime()
      : 0;
    const currentStart = current.effective_from
      ? new Date(current.effective_from).getTime()
      : 0;
    return candidateStart > currentStart;
  }

  private effectiveFromTime(a: SalaryStructureAssignment): number {
    return a.effective_from ? new Date(a.effective_from).getTime() : 0;
  }

  private inclusiveDays(start: Date, end: Date): number {
    const ms = this.stripTime(end).getTime() - this.stripTime(start).getTime();
    return Math.max(0, Math.floor(ms / 86_400_000) + 1);
  }

  /** Weekdays (Mon–Fri) in the range, minus any holiday in the set. */
  private scheduledWorkingDays(
    start: Date,
    end: Date,
    holidaySet: Set<string>,
  ): number {
    let count = 0;
    const cursor = this.stripTime(start);
    const last = this.stripTime(end);
    while (cursor <= last) {
      if (!this.isWeekend(cursor) && !holidaySet.has(this.toIso(cursor))) {
        count += 1;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  }

  private isWeekend(date: Date): boolean {
    const day = date.getUTCDay();
    return day === 0 || day === 6; // Sunday or Saturday
  }

  private stripTime(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private toIso(date: Date): string {
    return this.stripTime(date).toISOString().slice(0, 10);
  }
}
