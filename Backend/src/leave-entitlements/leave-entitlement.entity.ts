import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

const numericTransformer = {
  to: (value?: number | null) => value ?? 0,
  from: (value: string | number | null) => Number(value ?? 0),
};

/**
 * The yearly grant HR/Admin creates from the Leave Entitlement module: one
 * row per (user, leave_type, year), enforced by a DB unique constraint so a
 * repeat assignment for the same trio updates instead of duplicating.
 *
 * This is the durable record of *why* `UserLeaveBalance.allocated_days` is
 * what it is for the current year — `UserLeaveBalance` stays the live,
 * fast-to-read balance row that `LeaveRequestsService` deducts against;
 * `LeaveEntitlement` is the yearly ledger entry that produced it.
 */
@Entity('leave_entitlements')
export class LeaveEntitlement {
  @PrimaryGeneratedColumn('uuid')
  leave_entitlement_id!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => LeaveType, { nullable: false, onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'leave_type_id' })
  leaveType!: LeaveType;

  @Column({ type: 'uuid' })
  leave_type_id!: string;

  @Column({ type: 'smallint' })
  year!: number;

  /** Base days granted for the year (the "Entitlement" figure). */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  entitled_days!: number;

  /** Days carried forward from the previous year's unused balance. */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  carried_forward_days!: number;

  /**
   * Net of all manual increase/deduct adjustments made after the initial
   * grant (positive = increase, negative = deduct). Kept separate from
   * `entitled_days` so the ledger can always show "granted X, adjusted by Y".
   */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  adjusted_days!: number;

  /** Days expired (e.g. unused carry-forward past its window). */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  expired_days!: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  created_by?: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  /** Total days this entitlement contributes to the balance this year. */
  get total_days(): number {
    return (
      this.entitled_days +
      this.carried_forward_days +
      this.adjusted_days -
      this.expired_days
    );
  }

  toJSON(): LeaveEntitlement & { total_days: number } {
    return { ...this, total_days: this.total_days };
  }
}
