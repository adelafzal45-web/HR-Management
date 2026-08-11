import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Check,
} from 'typeorm';

/**
 * Single-row global payroll settings (spec §1, "Payroll General Settings").
 *
 * Same pattern as `company_settings`: id is always 1, a DB CHECK guarantees one
 * row, and the controller enforces GET/PATCH against id=1 only. These are the
 * org-wide switches that frame every payroll run — pay frequency, how working
 * days are counted, whether an Admin must approve a run, whether employees see
 * their own payslips, and when a period locks.
 *
 * Business rules that vary per component/employee do NOT live here — those are
 * the salary components, structures, and (phase 2) rule builders. This row only
 * holds the settings that are genuinely global.
 */
@Entity('payroll_settings')
@Check('"id" = 1')
export class PayrollSettings {
  @PrimaryColumn({ type: 'integer', default: 1 })
  id!: number;

  // ---- Period / frequency -------------------------------------------------

  /** monthly | weekly | biweekly — how often payroll runs. */
  @Column({ length: 20, default: 'monthly' })
  frequency!: string;

  /** calendar (1st–last of month) | custom (period start/end set per run). */
  @Column({ length: 20, default: 'calendar' })
  period_type!: string;

  @Column({ length: 10, default: 'PKR' })
  currency!: string;

  /**
   * How WORKING_DAYS is derived for a period:
   *   calendar   — every day in the period
   *   fixed      — `fixed_working_days` below
   *   attendance — working-day schedule minus weekends/holidays (default)
   */
  @Column({ length: 20, default: 'attendance' })
  working_days_source!: string;

  /** Used only when working_days_source = 'fixed'. */
  @Column({ type: 'int', default: 26 })
  fixed_working_days!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 8,
  })
  working_hours_per_day!: number;

  // ---- Workflow switches --------------------------------------------------

  /**
   * When true, a processed run must be approved (by an Administrator holding
   * `payroll.approve`) before it can be locked/paid. Off by default so a fresh
   * install lets HR complete a run end-to-end without a second role existing.
   */
  @Column({ default: false })
  approval_enabled!: boolean;

  /** Generate a payslip per employee automatically when a run is processed. */
  @Column({ default: true })
  auto_generate_payslip!: boolean;

  /** Whether employees can view their own payslips (self-service). */
  @Column({ default: true })
  employee_self_service!: boolean;

  /** Whether a locked period is frozen against further edits. */
  @Column({ default: true })
  payroll_locking_enabled!: boolean;

  /**
   * Day of month a payslip period is considered closed ("When Payslip Is Closed
   * Means 20 Date"). Informational for the workflow; runs can still be created
   * for an open period before this day.
   */
  @Column({ type: 'int', default: 20 })
  payslip_close_day!: number;

  /**
   * Overtime is OFF by default per spec: OT is only paid on non-working days
   * and government holidays, configured in the (phase 2) overtime rule builder.
   * This master switch keeps OT out of the calculation entirely until enabled.
   */
  @Column({ default: false })
  overtime_enabled!: boolean;

  /** none | nearest | up | down — rounding applied to the net figure. */
  @Column({ length: 10, default: 'nearest' })
  rounding!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
