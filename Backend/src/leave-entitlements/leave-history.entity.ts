import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

export enum LeaveHistoryType {
  ENTITLEMENT = 'Entitlement',
  ADJUSTMENT = 'Adjustment',
  LEAVE_TAKEN = 'Leave Taken',
  CARRY_FORWARD = 'Carry Forward',
  EXPIRY = 'Expiry',
}

/**
 * Append-only ledger: every balance-affecting event writes exactly one row
 * here, in addition to whatever it does to `UserLeaveBalance` /
 * `LeaveEntitlement`. Never updated or deleted — it is the audit trail the
 * "Leave History" screen and Reporting read from, and the thing that lets
 * an HR admin answer "why is this employee's balance what it is".
 */
@Entity('leave_history')
export class LeaveHistory {
  @PrimaryGeneratedColumn('uuid')
  leave_history_id!: string;

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

  @Column({ type: 'varchar', length: 20 })
  type!: LeaveHistoryType;

  /** Signed delta applied to the balance (+ for credit, - for debit). */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: {
      to: (value?: number) => value ?? 0,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  amount!: number;

  /** Remaining balance for this (user, leave_type, year) after this entry. */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    transformer: {
      to: (value?: number) => value ?? 0,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  balance_after!: number;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  /** e.g. the leave_request id this "Leave Taken" entry deducted for. */
  @Column({ type: 'uuid', nullable: true })
  reference_id?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  reference_type?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: true })
  @JoinColumn({ name: 'performed_by' })
  performedBy?: User | null;

  @Column({ type: 'uuid', nullable: true })
  performed_by?: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
