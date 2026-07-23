import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';

import { Role } from '../roles/roles.entity';
import { Department } from '../department/department.entity';
import { Attendance } from '../attendance/attendance.entity';
import { LeaveRequest } from '../leave-requests/leave-requests.entity';
import { Designation } from '../designation/designation.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  user_id!: string;

  @Column({ length: 100 })
  first_name!: string;

  @Column({ length: 100 })
  last_name!: string;

  @Column({
    unique: true,
    length: 255,
  })
  email!: string;

  @Column()
  password!: string;

  @Column({
    nullable: true,
    length: 20,
  })
  phone?: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  profile_image?: string;

  @Column({
    nullable: true,
    length: 30,
  })
  employee_type?: string;

  @ManyToOne(() => Designation, (designation) => designation.users)
  @JoinColumn({ name: 'designation_id' })
  designation!: Designation;

  @Column({
    type: 'date',
  })
  joining_date!: Date;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  salary?: number;

  @Column({
    default: true,
  })
  status!: boolean;

  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => Department, (department) => department.users)
  @JoinColumn({ name: 'department_id' })
  department!: Department;

  @OneToMany(() => Attendance, (attendance) => attendance.user)
  attendance!: Attendance[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.user)
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.approved_by)
  approvedLeaveRequests!: LeaveRequest[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
