import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Catalog of leave types available across the organisation.
 *
 * `leave_requests.leave_type` remains free text for now — see the
 * CreateLeaveTypes migration for why no FK is introduced yet.
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

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
