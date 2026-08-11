import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';

import {
  moneyDefaultZero,
  moneyTransformer,
} from '../payroll-engine/decimal.transformer';

/**
 * An employee loan or salary advance (spec §9).
 *
 * The loan is repaid by fixed installments deducted from payroll. `outstanding`
 * is the running balance, decremented (idempotently, keyed on the period) each
 * time an installment is deducted by a payroll run; when it reaches zero the
 * loan is `closed`. `start_period` is when repayment begins — installments
 * before it are not deducted.
 */
@Entity('employee_loans')
@Index('idx_employee_loans_user_status', ['user_id', 'status'])
export class EmployeeLoan {
  @PrimaryGeneratedColumn('uuid')
  loan_id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ length: 120 })
  name!: string;

  /** The full amount borrowed. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  principal!: number;

  /** Remaining balance still to be repaid. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  outstanding!: number;

  /** Fixed amount deducted each period. */
  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  installment_amount!: number;

  /** The payroll period id repayment starts from (nullable = starts anytime). */
  @Column({ type: 'uuid', nullable: true })
  start_period_id?: string | null;

  /** active | closed | paused. Paused loans are skipped by payroll runs. */
  @Column({ length: 20, default: 'active' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  remarks?: string | null;

  @OneToMany(() => LoanInstallment, (installment) => installment.loan, {
    cascade: true,
  })
  installments!: LoanInstallment[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}

/**
 * One scheduled repayment of a loan. Generated up front from principal /
 * installment amount; a payroll run marks the period's installment `deducted`
 * and stamps `deducted_on`. The `(loan_id, period_id)` pairing is what makes
 * deduction idempotent — re-running a period never double-charges.
 */
@Entity('loan_installments')
@Index('idx_loan_installments_loan', ['loan_id'])
export class LoanInstallment {
  @PrimaryGeneratedColumn('uuid')
  installment_id!: string;

  @ManyToOne(() => EmployeeLoan, (loan) => loan.installments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'loan_id' })
  loan!: EmployeeLoan;

  @Column({ type: 'uuid' })
  loan_id!: string;

  /** The period this installment was (or will be) deducted in. */
  @Column({ type: 'uuid', nullable: true })
  period_id?: string | null;

  /** 1-based position in the repayment schedule. */
  @Column({ type: 'int', default: 0 })
  sequence!: number;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  amount!: number;

  /** scheduled | deducted | skipped. */
  @Column({ length: 20, default: 'scheduled' })
  status!: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  balance_after?: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  deducted_on?: Date | null;

  @CreateDateColumn()
  created_at!: Date;
}
