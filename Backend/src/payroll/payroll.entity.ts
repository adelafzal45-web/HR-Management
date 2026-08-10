import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

import { User } from '../users/user.entity';

import { PayrollItem } from './payroll-item.entity';
import { PayrollAdjustment } from './payroll-adjustment.entity';

/**
 * Main payroll record for one employee for one salary period.
 *
 * Salary period is always treated as a 30-day payroll period.
 *
 * IMPORTANT:
 * Salary/component values are SNAPSHOTS.
 * If the employee's salary changes later, an already-created payroll
 * must not change.
 */
@Entity('payrolls')
@Index(['user_id', 'period_start', 'period_end'], { unique: true })
export class Payroll {
  // ==========================================
  // PRIMARY KEY
  // ==========================================

  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'Unique payroll UUID.',
  })
  @PrimaryGeneratedColumn('uuid')
  payroll_id!: string;

  // ==========================================
  // EMPLOYEE
  // ==========================================

  @ApiProperty({
    description: 'Employee to whom this payroll belongs.',
  })
  @ManyToOne(() => User, {
    nullable: false,
    eager: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @ApiProperty({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'Employee UUID.',
  })
  @Column({
    type: 'uuid',
  })
  user_id!: string;

  // ==========================================
  // PAYROLL PERIOD
  // ==========================================

  @ApiProperty({
    example: '2026-08-01',
    description: 'Start date of the payroll period.',
  })
  @Column({
    type: 'date',
  })
  period_start!: Date;

  @ApiProperty({
    example: '2026-08-30',
    description:
      'End date of the payroll period. Payroll calculations use a fixed 30-day period.',
  })
  @Column({
    type: 'date',
  })
  period_end!: Date;

  @ApiProperty({
    example: 30,
    description: 'Number of salary days. Always 30 according to company rules.',
  })
  @Column({
    type: 'smallint',
    default: 30,
  })
  salary_days!: number;

  // ==========================================
  // PAYROLL STATUS
  // ==========================================

  /**
   * We will replace these string values with PayrollStatus enum
   * when Phase 2 enums are added.
   *
   * Expected values:
   *
   * DRAFT
   * PROCESSING
   * PROCESSED
   * APPROVED
   * LOCKED
   * CANCELLED
   */
  @ApiProperty({
    example: 'DRAFT',
    description:
      'Payroll lifecycle status. Will be backed by PayrollStatus enum.',
    enum: [
      'DRAFT',
      'PROCESSING',
      'PROCESSED',
      'APPROVED',
      'LOCKED',
      'CANCELLED',
    ],
  })
  @Column({
    type: 'varchar',
    length: 20,
    default: 'DRAFT',
  })
  status!: string;

  // ==========================================
  // GENERATION
  // ==========================================

  @ApiPropertyOptional({
    example: '2026-08-25T10:30:00.000Z',
    description:
      'Date/time when payroll was generated. Payroll generation is allowed from the 25th of the month.',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  generated_at?: Date | null;

  @ApiPropertyOptional({
    example: '2026-08-25T10:30:00.000Z',
    description: 'Date/time when payroll was approved.',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  approved_at?: Date | null;

  @ApiPropertyOptional({
    description: 'User who approved the payroll.',
  })
  @ManyToOne(() => User, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'approved_by',
  })
  approved_by?: User | null;

  @ApiPropertyOptional({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'UUID of the user who approved the payroll.',
  })
  @Column({
    type: 'uuid',
    nullable: true,
  })
  approved_by_id?: string | null;

  @ApiPropertyOptional({
    example: '2026-08-25T11:00:00.000Z',
    description: 'Date/time when payroll was locked.',
  })
  @Column({
    type: 'timestamp',
    nullable: true,
  })
  locked_at?: Date | null;

  @ApiPropertyOptional({
    description: 'User who locked the payroll.',
  })
  @ManyToOne(() => User, {
    nullable: true,
    eager: false,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'locked_by',
  })
  locked_by?: User | null;

  @ApiPropertyOptional({
    example: 'a3f1c2d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
    description: 'UUID of the user who locked the payroll.',
  })
  @Column({
    type: 'uuid',
    nullable: true,
  })
  locked_by_id?: string | null;

  // ==========================================
  // SALARY SNAPSHOT
  // ==========================================

  @ApiProperty({
    example: 100000,
    description:
      'Employee total salary snapshot used for this payroll period.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  total_salary!: number;

  @ApiProperty({
    example: 75000,
    description: 'Basic salary = 75% of total salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  basic_salary!: number;

  @ApiProperty({
    example: 15000,
    description: 'Compute allowance = 15% of total salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  compute_allowance!: number;

  @ApiProperty({
    example: 10000,
    description:
      'Medical allowance = 10% of total salary. This amount is tax-free.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  medical_allowance!: number;

  // ==========================================
  // ATTENDANCE / LEAVE SNAPSHOT
  // ==========================================

  @ApiProperty({
    example: 22,
    description: 'Number of normal working days in the payroll period.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 22,
  })
  working_days!: number;

  @ApiProperty({
    example: 8,
    description: 'Paid weekend days in the payroll period.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 8,
  })
  paid_weekend_days!: number;

  @ApiProperty({
    example: 1,
    description: 'Approved unpaid leave days.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  unpaid_leave_days!: number;

  @ApiProperty({
    example: 1,
    description: 'Unauthorized absence days.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  unauthorized_absence_days!: number;

  @ApiProperty({
    example: 1,
    description: 'Half-day attendance/leave deductions.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  half_days!: number;

  @ApiProperty({
    example: 2,
    description: 'Weekend days on which the employee worked.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  weekend_work_days!: number;

  @ApiProperty({
    example: 1,
    description: 'Public holidays on which the employee worked.',
  })
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  public_holiday_work_days!: number;

  // ==========================================
  // EARNINGS
  // ==========================================

  @ApiProperty({
    example: 7500,
    description:
      'Additional earnings for weekend work. Each weekend work day earns 3× daily basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  weekend_work_earning!: number;

  @ApiProperty({
    example: 7500,
    description:
      'Additional earnings for public holiday work. Each public holiday work day earns 3× daily basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  public_holiday_work_earning!: number;

  @ApiProperty({
    example: 5000,
    description: 'Commission manually added by HR during payroll processing.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  commission!: number;

  @ApiProperty({
    example: 10000,
    description: 'Bonus manually added by HR during payroll processing.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  bonus!: number;

  @ApiProperty({
    example: 5000,
    description:
      'Approved reimbursements included in payroll. Reimbursements are tax-free.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  approved_reimbursement!: number;

  // ==========================================
  // DEDUCTIONS
  // ==========================================

  @ApiProperty({
    example: 2500,
    description:
      'Deduction from unpaid leave. Each day deducts daily basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  unpaid_leave_deduction!: number;

  @ApiProperty({
    example: 2500,
    description:
      'Deduction from unauthorized absence. Each day deducts daily basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  unauthorized_absence_deduction!: number;

  @ApiProperty({
    example: 1250,
    description:
      'Deduction for half-day attendance/leave. Each half-day deducts 50% of daily basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  half_day_deduction!: number;

  @ApiProperty({
    example: 1500,
    description: 'Provident Fund = 2% of basic salary.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  provident_fund!: number;

  @ApiProperty({
    example: 5000,
    description: 'Automatic monthly loan deductions.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  loan_deduction!: number;

  @ApiProperty({
    example: 3500,
    description: 'Government tax calculated from configurable tax slabs.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  government_tax!: number;

  // ==========================================
  // TAXABLE INCOME
  // ==========================================

  @ApiProperty({
    example: 90000,
    description:
      'Taxable income after excluding tax-free medical allowance and approved reimbursements.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  taxable_income!: number;

  // ==========================================
  // TOTALS
  // ==========================================

  @ApiProperty({
    example: 110000,
    description:
      'Total earnings before deductions and tax.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  gross_earnings!: number;

  @ApiProperty({
    example: 16250,
    description: 'Total payroll deductions excluding tax.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  total_deductions!: number;

  @ApiProperty({
    example: 95000,
    description: 'Final net salary payable to the employee.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  net_salary!: number;

  // ==========================================
  // DAILY BASIC SALARY SNAPSHOT
  // ==========================================

  @ApiProperty({
    example: 2500,
    description:
      'Daily basic salary. Always calculated as Basic Salary ÷ 30.',
  })
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  daily_basic_salary!: number;

  // ==========================================
  // RELATIONSHIPS
  // ==========================================

  @ApiPropertyOptional({
    description: 'Detailed payroll line items.',
    type: () => [PayrollItem],
  })
  @OneToMany(
    () => PayrollItem,
    (item) => item.payroll,
    {
      cascade: true,
    },
  )
  items!: PayrollItem[];

  @ApiPropertyOptional({
    description: 'Manual payroll adjustments such as commission and bonus.',
    type: () => [PayrollAdjustment],
  })
  @OneToMany(
    () => PayrollAdjustment,
    (adjustment) => adjustment.payroll,
    {
      cascade: true,
    },
  )
  adjustments!: PayrollAdjustment[];

  // ==========================================
  // NOTES
  // ==========================================

  @ApiPropertyOptional({
    example: 'Payroll processed for August 2026.',
    description: 'Optional payroll processing notes.',
  })
  @Column({
    type: 'text',
    nullable: true,
  })
  notes?: string | null;

  // ==========================================
  // TIMESTAMPS
  // ==========================================

  @ApiProperty({
    example: '2026-08-25T10:00:00.000Z',
  })
  @CreateDateColumn({
    type: 'timestamp',
  })
  created_at!: Date;

  @ApiProperty({
    example: '2026-08-25T11:00:00.000Z',
  })
  @UpdateDateColumn({
    type: 'timestamp',
  })
  updated_at!: Date;
}