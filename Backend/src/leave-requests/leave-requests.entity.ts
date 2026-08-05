import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

import { LeaveDurationType } from './dto/create-leave-request.dto';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  leave_id!: string;

  @Column({
    length: 30,
  })
  leave_type!: string;

  /**
   * Leave duration type
   *
   * FIRST_HALF
   * SECOND_HALF
   * FULL_DAY
   * MULTIPLE_DAYS
   */
  @Column({
    length: 20,
    default: LeaveDurationType.FULL_DAY,
  })
  duration_type!: LeaveDurationType;

  @Column({
    type: 'date',
  })
  start_date!: Date;

  @Column({
    type: 'date',
  })
  end_date!: Date;

  /**
   * Calculated leave days.
   *
   * FIRST_HALF = 0.5
   * SECOND_HALF = 0.5
   * FULL_DAY = 1
   * MULTIPLE_DAYS = calculated value
   */
  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 1,
    transformer: {
      to: (value?: number) => value ?? 1,
      from: (value: string | number | null) => Number(value ?? 1),
    },
  })
  days_count!: number;

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

  /**
   * Employee who requested leave
   */
  @ManyToOne(() => User, (user) => user.leaveRequests, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  /**
   * Employee/Manager who approved leave
   */
  @ManyToOne(() => User, (user) => user.approvedLeaveRequests, {
    nullable: true,
    eager: true,
  })
  @JoinColumn({
    name: 'approved_by',
  })
  approved_by?: User;
}
