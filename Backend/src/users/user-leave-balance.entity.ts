import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';

import { User } from './user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

@Entity('user_leave_balances')
@Unique('UQ_user_leave_type_year', ['user_id', 'leave_type_id', 'year'])
@Index('IDX_user_leave_balance_user', ['user_id'])
@Index('IDX_user_leave_balance_year', ['year'])
export class UserLeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  user_leave_balance_id!: string;

  /**
   * Employee relation
   *
   * One employee can have multiple leave balances.
   *
   * Example:
   *
   * Nouman
   *  - Sick Leave
   *  - Casual Leave
   *  - Annual Leave
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
   * Leave Type:
   * Annual Leave
   *
   * Employee:
   * Nouman
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
   * Leave entitlement year
   *
   * Example:
   *
   * 2026
   *
   * Employee will have separate
   * balance records every year.
   */
  @Column({
    type: 'int',
  })
  year!: number;

  /**
   * Total allocated leaves
   *
   * Example:
   *
   * Annual Leave = 20
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
   * Approved leaves consumed
   *
   * Example:
   *
   * Employee used 5 days
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
   * Remaining leaves
   *
   * Formula:
   *
   * allocated_days - used_days
   */
  get remaining_days(): number {
    return Math.max(0, this.allocated_days - this.used_days);
  }

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  /**
   * API response format
   *
   * User will receive:
   *
   * {
   *   leave_type:"Annual Leave",
   *   year:2026,
   *   allocated_days:20,
   *   used_days:5,
   *   remaining_days:15
   * }
   */
  toJSON() {
    return {
      user_leave_balance_id: this.user_leave_balance_id,

      user_id: this.user_id,

      leave_type: this.leave_type,

      leave_type_id: this.leave_type_id,

      year: this.year,

      allocated_days: this.allocated_days,

      used_days: this.used_days,

      remaining_days: this.remaining_days,

      created_at: this.created_at,

      updated_at: this.updated_at,
    };
  }
}
