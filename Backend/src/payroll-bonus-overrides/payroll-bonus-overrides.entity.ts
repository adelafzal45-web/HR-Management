import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';

import { moneyDefaultZero } from '../payroll-engine/decimal.transformer';
import { User } from '../users/user.entity';
import { PayrollPeriod } from '../payroll-periods/payroll-periods.entity';

/**
 * A manual, per-(employee, period) bonus for a single payroll run.
 *
 * The configured bonus rule (a PayrollRule of rule_type='bonus') computes a
 * bonus for everyone in scope, but HR sometimes needs to hand-set one employee's
 * bonus for a specific run — a spot award, a correction, or a zero to exclude
 * someone. This row is that override: keyed uniquely on (user_id, period_id),
 * upserted from the Run Payroll grid, and honored by the engine with precedence
 * over the rule. An amount of 0 is meaningful — it cancels the bonus for that
 * employee this run; deleting the row reverts to the rule value.
 */
@Entity('payroll_bonus_overrides')
@Unique('uq_payroll_bonus_overrides_user_period', ['user_id', 'period_id'])
@Index('idx_payroll_bonus_overrides_period', ['period_id'])
export class PayrollBonusOverride {
  @PrimaryGeneratedColumn('uuid')
  bonus_override_id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => PayrollPeriod, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'period_id' })
  period!: PayrollPeriod;

  @Column({ type: 'uuid' })
  period_id!: string;

  /** The manual bonus amount for this run. 0 explicitly cancels the bonus. */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  amount!: number;

  /** Optional HR memo, surfaced on the payslip's bonus line. */
  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** Who set it; kept (SET NULL) even if the actor's user record is later removed. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  created_by?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
