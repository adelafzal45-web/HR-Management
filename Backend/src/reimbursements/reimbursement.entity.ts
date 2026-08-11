import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

import { User } from '../users/user.entity';
import { moneyDefaultZero } from '../payroll-engine/decimal.transformer';

/**
 * The claim lifecycle. An employee submits `pending`; HR/Admin move it to
 * `approved` or `rejected`; the payroll engine flips `approved` to `paid` when a
 * run picks it up. `paid` is terminal and carries the period/payslip that paid
 * it, which is what stops a claim being reimbursed twice.
 */
export const REIMBURSEMENT_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'paid',
] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUSES)[number];

/**
 * Suggested expense categories. Deliberately a plain varchar rather than a DB
 * enum — HR can file a claim under anything, and locking the list into a CHECK
 * constraint would mean a migration every time the company adds an expense type.
 */
export const REIMBURSEMENT_CATEGORIES = [
  'Travel',
  'Fuel',
  'Meals',
  'Accommodation',
  'Medical',
  'Internet',
  'Mobile',
  'Equipment',
  'Training',
  'Other',
] as const;

/**
 * An out-of-pocket expense an employee claims back (spec §2 reimbursement
 * component, now employee-initiated).
 *
 * Payroll treats an approved claim as a **non-taxable earning**: it is added to
 * net pay but deliberately excluded from gross, so it never inflates the taxable
 * base or any percent-of-gross component. Reimbursing a receipt is repayment of
 * money the employee already spent, not income.
 */
@Entity('reimbursements')
@Index('idx_reimbursements_user_status', ['user_id', 'status'])
@Index('idx_reimbursements_status_date', ['status', 'expense_date'])
export class Reimbursement {
  @PrimaryGeneratedColumn('uuid')
  reimbursement_id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  /** The employee the claim belongs to — always taken from the token on /me. */
  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ length: 160 })
  title!: string;

  @Column({ length: 60, default: 'Other' })
  category!: string;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyDefaultZero,
  })
  amount!: number;

  /**
   * When the expense was incurred. This — not the submission date — decides
   * which payroll period reimburses it, so a claim filed late still lands
   * against the month it belongs to.
   */
  @Column({ type: 'date' })
  expense_date!: Date;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** Link to a receipt held elsewhere; file upload is not part of this pass. */
  @Column({ length: 500, nullable: true, type: 'varchar' })
  receipt_url?: string | null;

  @Column({ length: 20, default: 'pending' })
  status!: ReimbursementStatus;

  // ---- Decision audit ------------------------------------------------------

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'decided_by' })
  decidedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  decided_by?: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decided_at?: Date | null;

  @Column({ type: 'text', nullable: true })
  decision_note?: string | null;

  // ---- Payment trace -------------------------------------------------------
  //
  // Set together, inside the same transaction that persists the payslip. Both
  // are plain uuid columns (no entity relation) to keep this module free of a
  // circular import with payslips/payroll-periods — the engine already owns
  // that graph.

  @Column({ type: 'uuid', nullable: true })
  paid_period_id?: string | null;

  @Column({ type: 'uuid', nullable: true })
  paid_payslip_id?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
