import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

import { moneyDefaultZero } from '../payroll-engine/decimal.transformer';
import { User } from '../users/user.entity';
import { PayrollPeriod } from '../payroll-periods/payroll-periods.entity';

/**
 * One employee's pay for one period (spec §14).
 *
 * A payslip is a *snapshot*, not a view: `calculation_json` stores the full
 * breakdown — inputs, every component, and the per-line "Why?" note — as it was
 * computed at generation time. That is what makes historical payslips immune to
 * later rule changes (spec §16 versioning): re-reading an old payslip re-renders
 * the stored snapshot, it never recalculates. The scalar columns duplicate the
 * headline figures for cheap listing and reporting.
 */
@Entity('payslips')
export class Payslip {
  @PrimaryGeneratedColumn('uuid')
  payslip_id!: string;

  @ManyToOne(() => PayrollPeriod, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period!: PayrollPeriod;

  @Column({ type: 'uuid' })
  period_id!: string;

  @ManyToOne(() => User, { nullable: false, eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid', nullable: true })
  structure_id?: string | null;

  // ---- Headline figures (snapshot) ---------------------------------------

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  basic_salary!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  gross_salary!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  total_earnings!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  total_deductions!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  net_salary!: number;

  // ---- Attendance inputs (snapshot) --------------------------------------

  @Column({ type: 'int', default: 0 })
  working_days!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  present_days!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  absent_days!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  paid_leave_days!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  unpaid_leave_days!: number;

  @Column({ type: 'int', default: 0 })
  late_count!: number;

  @Column({
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  overtime_hours!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  overtime_amount!: number;

  /** draft | generated | approved | locked | paid. */
  @Column({ length: 20, default: 'generated' })
  status!: string;

  /**
   * The full computed breakdown, exactly as calculated. Shape mirrors the
   * PreviewResult the calculation service returns (inputs + lines[] with notes).
   */
  @Column({ type: 'jsonb', nullable: true })
  calculation_json?: unknown;

  @Column({ type: 'date', nullable: true })
  payment_date?: Date | null;

  @OneToMany(() => PayslipLine, (line) => line.payslip, { cascade: true })
  lines!: PayslipLine[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

/**
 * One line on a payslip — a single component's contribution, or a synthetic
 * line the engine adds (absent deduction, tax). `calc_note` is the "Why?" text
 * (spec §14 drill-down): a plain-English explanation of how `amount` was
 * derived, e.g. "10% of BASIC (100000) = 10000".
 */
@Entity('payslip_lines')
export class PayslipLine {
  @PrimaryGeneratedColumn('uuid')
  line_id!: string;

  @ManyToOne(() => Payslip, (payslip) => payslip.lines, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'payslip_id' })
  payslip!: Payslip;

  @Column({ type: 'uuid' })
  payslip_id!: string;

  /** Null for synthetic lines that are not backed by a component. */
  @Column({ type: 'uuid', nullable: true })
  component_id?: string | null;

  @Column({ length: 100 })
  label!: string;

  /** earning | deduction. */
  @Column({ length: 20 })
  type!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  amount!: number;

  /** The "Why?" explanation for this line. */
  @Column({ type: 'text', nullable: true })
  calc_note?: string | null;

  @Column({ type: 'int', default: 0 })
  display_order!: number;
}
