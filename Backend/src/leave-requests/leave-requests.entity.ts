import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  leave_id!: string;

  @Column({
    length: 30,
  })
  leave_type!: string;

  /**
   * Optional link to the leave type catalog. `leave_type` (free text) is
   * kept as-is for backward compatibility with existing rows and any client
   * still posting a name; when present, this FK is what balance deduction
   * and the leave-history ledger key off, since `leave_type` alone cannot be
   * safely matched back to a `LeaveType`/`UserLeaveBalance` row.
   */
  @ManyToOne(() => LeaveType, { nullable: true, eager: true })
  @JoinColumn({ name: 'leave_type_id' })
  leaveTypeRef?: LeaveType | null;

  @Column({ type: 'uuid', nullable: true })
  leave_type_id?: string | null;

  @Column({
    type: 'date',
  })
  start_date!: Date;

  @Column({
    type: 'date',
  })
  end_date!: Date;

  /** True when this is a single-day request charged as half a day. */
  @Column({ type: 'boolean', default: false })
  is_half_day!: boolean;

  /**
   * Chargeable days computed at approval time (working days in range, minus
   * weekends/holidays, half-day applied). Null until approved, so it never
   * drifts from what was actually deducted from the balance.
   */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null ? null : Number(value),
    },
  })
  days_count?: number | null;

  @Column({
    type: 'text',
    nullable: true,
  })
  reason?: string;

  @Column({
    length: 20,
    default: 'Pending',
  })
  status!: string;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  applied_date!: Date;

  @Column({
    type: 'timestamp',
    nullable: true,
  })
  approved_date?: Date;

  @ManyToOne(() => User, (user) => user.leaveRequests, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @ManyToOne(() => User, (user) => user.approvedLeaveRequests, {
    nullable: true,
    eager: true,
  })
  @JoinColumn({
    name: 'approved_by',
  })
  approved_by?: User;
}