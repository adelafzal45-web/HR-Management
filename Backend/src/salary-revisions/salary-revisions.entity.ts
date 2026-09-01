import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import {
  moneyTransformer,
  moneyDefaultZero,
} from '../payroll-engine/decimal.transformer';
import { User } from '../users/user.entity';

/**
 * An append-only record of one change to an employee's base salary
 * (`users.salary`).
 *
 * Salary was historically a single mutable field edited in place on the employee
 * form, leaving no answer to "who changed this, from what, to what, why, and
 * when". A revision captures exactly that: the previous and new base salary, the
 * signed delta, whether it was an increment or decrement, how HR expressed it (a
 * flat amount or a percentage of the previous salary), the reason, the effective
 * date, and the author. Rows are never updated — a correction is just another
 * revision — so the table is the salary history the employee drawer renders.
 *
 * The revision drives `users.salary`. When an employee is instead covered by a
 * SalaryStructureAssignment carrying a non-null `base_salary`, that assignment
 * supersedes `users.salary` in the engine (see PayrollCalculationService); the
 * service surfaces a warning in that case rather than silently recording a raise
 * that never reaches payroll.
 */
@Entity('salary_revisions')
@Index('idx_salary_revisions_user', ['user_id', 'created_at'])
export class SalaryRevision {
  @PrimaryGeneratedColumn('uuid')
  revision_id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  user_id!: string;

  /** Base salary before this change; null when the employee had none set. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  previous_salary?: number | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyDefaultZero,
  })
  new_salary!: number;

  /** new_salary − previous_salary; positive for an increment, negative for a decrement. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyDefaultZero,
  })
  delta!: number;

  /** increment | decrement. */
  @Column({ length: 20 })
  change_type!: string;

  /** amount | percent — how HR expressed the change in the form. */
  @Column({ length: 10 })
  input_mode!: string;

  /** The literal figure HR entered (a currency amount, or a percentage). */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyDefaultZero,
  })
  input_value!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string | null;

  /**
   * The date the change takes effect. Stored (and surfaced) as a `YYYY-MM-DD`
   * string — pg `date` round-trips as a plain string, which is exactly what the
   * history table shows, with no timezone drift from a coerced `Date`.
   */
  @Column({ type: 'date' })
  effective_date!: string;

  /** Who applied it; kept (SET NULL) even if the actor's user record is later removed. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  created_by?: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
