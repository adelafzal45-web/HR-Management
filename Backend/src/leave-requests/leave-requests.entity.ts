import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

/**
 * How much of the day (or days) a request covers.
 *
 * `FIRST_HALF`/`SECOND_HALF` are both single-day and both charge 0.5; they are
 * kept distinct because the planner and the attendance view need to know which
 * half of the day the employee is away, which a plain `is_half_day` boolean
 * cannot express. `is_half_day` is still maintained on save so the existing
 * day-counting path and any older client keep working unchanged.
 */
export enum LeaveDurationType {
  FULL_DAY = 'Full Day',
  FIRST_HALF = 'First Half',
  SECOND_HALF = 'Second Half',
  MULTIPLE_DAYS = 'Multiple Days',
}

export const HALF_DAY_DURATIONS: ReadonlySet<LeaveDurationType> = new Set([
  LeaveDurationType.FIRST_HALF,
  LeaveDurationType.SECOND_HALF,
]);

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
   * Which portion of the day the request covers. Derived from `is_half_day`
   * for rows created before this column existed, so it is never null.
   */
  @Column({
    type: 'varchar',
    length: 20,
    default: LeaveDurationType.FULL_DAY,
  })
  duration_type!: LeaveDurationType;

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

  /**
   * Optional supporting document (medical certificate, travel booking, …).
   * Stores the server-side relative path produced by the upload handler, not
   * the client's original filename.
   */
  @Column({ type: 'varchar', length: 255, nullable: true })
  attachment_path?: string | null;

  /** Original filename, kept only so downloads get a sensible name back. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  attachment_name?: string | null;

  /**
   * The approver's note. Required of HR/Admin at decision time (enforced in
   * the DTO/service, not the column, so historical rows stay valid) and echoed
   * into the notification the employee receives.
   */
  @Column({ type: 'text', nullable: true })
  approval_reason?: string | null;

  @Column({ type: 'text', nullable: true })
  rejection_reason?: string | null;

  /** Who cancelled, and why — set when an approved request is withdrawn. */
  @Column({ type: 'text', nullable: true })
  cancellation_reason?: string | null;

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