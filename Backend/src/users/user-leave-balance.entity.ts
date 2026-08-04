import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './user.entity';
import { LeaveType } from '../leave-types/leave-types.entity';

/**
 * Which leave types an employee is entitled to, and how much of each.
 *
 * Replaces the old "one leave type per employee" idea: an employee is granted
 * several types (Casual, Sick, Annual…), each with its own allocation. One row
 * per (user, leave_type), enforced by a unique constraint — assigning the same
 * type twice is a data error, not two allocations to be summed.
 *
 * `remaining_days` is a getter, not a column, so allocated/used can never
 * drift out of sync with a stored total.
 */
@Entity('user_leave_balances')
export class UserLeaveBalance {
  @PrimaryGeneratedColumn('uuid')
  user_leave_balance_id!: string;

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

  @ManyToOne(() => LeaveType, {
    nullable: false,
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({
    name: 'leave_type_id',
  })
  leaveType!: LeaveType;

  @Column({
    type: 'uuid',
  })
  leave_type_id!: string;

  /**
   * Days granted for the current cycle.
   *
   * `numeric` columns come back from pg as strings, so the transformer parses
   * on read — otherwise every consumer would have to remember to Number() it,
   * and `allocated - used` would silently concatenate instead of subtract.
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

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  /** Derived, never stored. Clamped at 0 so an over-drawn balance reads as 0. */
  get remaining_days(): number {
    return Math.max(0, this.allocated_days - this.used_days);
  }

  /**
   * Puts `remaining_days` into the serialised payload.
   *
   * The getter lives on the prototype, and `JSON.stringify` copies only own
   * enumerable properties — so every endpoint returning a balance silently
   * dropped the field, leaving the UI unable to show how much leave is left.
   * Serialising through `toJSON` fixes all of those paths at once (the
   * standalone balances route, the leave-type assignment response, and the
   * nested `leaveBalances` on an employee record) while keeping the getter as
   * the single definition of the arithmetic.
   */
  toJSON(): UserLeaveBalance & { remaining_days: number } {
    return { ...this, remaining_days: this.remaining_days };
  }
}
