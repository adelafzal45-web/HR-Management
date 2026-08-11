import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { moneyDefaultZero } from '../payroll-engine/decimal.transformer';

/**
 * A configurable salary component (spec §2, "Salary Components Builder").
 *
 * This is the atom of the whole engine: HR defines what an "earning" or
 * "deduction" is — Basic, HRA, Transport, Tax, PF, an absent deduction — and
 * how its amount is derived (a flat figure, a percentage of basic/gross, a
 * per-day/per-hour rate, or a formula over approved variables). Structures then
 * compose these, and the calculation service evaluates them.
 *
 * The `include_in_*` flags describe how the component participates in derived
 * figures: whether it counts toward GROSS, whether it is taxable, whether it is
 * reduced by unpaid leave, and so on. Effective dating lets a component's
 * definition change over time without rewriting history — a new row supersedes
 * the old rather than overwriting it.
 */
@Entity('salary_components')
export class SalaryComponent {
  @PrimaryGeneratedColumn('uuid')
  component_id!: string;

  @Column({ length: 100 })
  name!: string;

  /** Stable machine code, unique, referenced by structures and reports. */
  @Column({ unique: true, length: 40 })
  code!: string;

  /** earning | deduction — see COMPONENT_TYPES. */
  @Column({ length: 20 })
  type!: string;

  /** fixed | percent_basic | percent_gross | per_day | per_hour | formula. */
  @Column({ length: 20 })
  calculation_type!: string;

  /**
   * The numeric input to the calculation: the flat amount for `fixed`, the
   * percentage for `percent_*`, or the per-unit rate for `per_day`/`per_hour`.
   * Ignored for `formula`.
   */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 4,
    default: 0,
    transformer: moneyDefaultZero,
  })
  amount!: number;

  /** The formula source, when calculation_type = 'formula'. */
  @Column({ type: 'text', nullable: true })
  formula?: string | null;

  /** Applies every period (vs. a one-off adjustment). */
  @Column({ default: true })
  is_recurring!: boolean;

  /** Earnings only: counts toward taxable income. */
  @Column({ default: false })
  is_taxable!: boolean;

  /** Earnings only: adds to GROSS (basic always does regardless). */
  @Column({ default: true })
  include_in_gross!: boolean;

  /** Earnings only: forms part of the base an overtime rate is computed on. */
  @Column({ default: false })
  include_in_overtime!: boolean;

  /** Earnings only: reduced pro-rata by unpaid leave / absence. */
  @Column({ default: false })
  include_in_leave_deduction!: boolean;

  /** Earnings only: forms part of the base a bonus is computed on. */
  @Column({ default: false })
  include_in_bonus!: boolean;

  /** Ordering on payslips and in the builder. */
  @Column({ type: 'int', default: 0 })
  display_order!: number;

  @Column({ default: true })
  is_active!: boolean;

  // ---- Effective dating ---------------------------------------------------

  @Column({ type: 'date', nullable: true })
  effective_from?: Date | null;

  @Column({ type: 'date', nullable: true })
  effective_to?: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
