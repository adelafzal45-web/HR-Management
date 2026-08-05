import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { UserLeaveBalance } from '../users/user-leave-balance.entity';

/**
 * Catalog of leave types available across the organisation.
 *
 * Example:
 * Annual Leave
 * Sick Leave
 * Casual Leave
 */
@Entity('leave_types')
export class LeaveType {
  @PrimaryGeneratedColumn('uuid')
  leave_type_id!: string;

  @Column({
    unique: true,
    length: 100,
  })
  name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  is_paid!: boolean;

  /**
   * Default yearly entitlement.
   *
   * Example:
   *
   * Annual Leave = 14 days/year
   * Sick Leave   = 10 days/year
   */
  @Column({
    type: 'int',
    default: 0,
  })
  max_days_per_year!: number;

  @Column({
    type: 'boolean',
    default: false,
  })
  carry_forward_allowed!: boolean;

  @Column({
    type: 'int',
    default: 0,
  })
  max_carry_forward_days!: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  is_active!: boolean;

  /**
   * Relation:
   *
   * One Leave Type
   *        |
   *        | OneToMany
   *        |
   * Many User Leave Balances
   *
   * Example:
   *
   * Annual Leave
   *      |
   *      |---- Employee A : 14 days
   *      |---- Employee B : 12 days
   */
  @OneToMany(() => UserLeaveBalance, (balance) => balance.leave_type)
  user_leave_balances!: UserLeaveBalance[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
