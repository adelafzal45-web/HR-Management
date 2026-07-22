import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { User } from '../users/user.entity';

@Entity('leave_requests')
export class LeaveRequest {
  @PrimaryGeneratedColumn('uuid')
  leave_id!: string;

  @Column({
    length: 30,
  })
  leave_type!: string;

  @Column({
    type: 'date',
  })
  start_date!: Date;

  @Column({
    type: 'date',
  })
  end_date!: Date;

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
