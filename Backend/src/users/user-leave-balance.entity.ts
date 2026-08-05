import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

import { User } from './user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

@Entity('user_leave_balances')
@Unique('UQ_user_leave_type_year', ['user_id', 'leave_type_id', 'year'])
export class UserLeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  user_leave_balance_id!: string;

  /**
   * Employee relation
   */
  @ManyToOne(() => User, (user) => user.leaveBalances, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @Column({
    type: 'uuid',
  })
  user_id!: string;

  /**
   * Leave Type relation
   *
   * Example:
   *
   * User: Nouman
   * Leave Type: Annual Leave
   * Year: 2026
   * Balance: 14 days
   */
  @ManyToOne(() => LeaveType, (leaveType) => leaveType.user_leave_balances, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'leave_type_id',
  })
  leave_type!: LeaveType;

  @Column({
    type: 'uuid',
  })
  leave_type_id!: string;

  /**
   * Leave entitlement year.
   *
   * Example:
   * 2026
   * 2027
   */
  @Column({
    type: 'int',
  })
  year!: number;

  /**
   * Total allocated leave for this year.
   */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number) => value ?? 0,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  allocated_days!: number;

  /**
   * Total approved leave already consumed.
   */
  @Column({
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
    transformer: {
      to: (value?: number) => value ?? 0,
      from: (value: string | number | null) => Number(value ?? 0),
    },
  })
  used_days!: number;

  /**
   * Remaining leave balance.
   *
   * Formula:
   *
   * allocated_days - used_days
   *
   * Example:
   *
   * Allocated = 14
   * Used = 5
   *
   * Remaining = 9
   */
  get remaining_days(): number {
    return Math.max(0, this.allocated_days - this.used_days);
  }

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  toJSON() {
    return {
      ...this,
      remaining_days: this.remaining_days,
    };
  }
}
