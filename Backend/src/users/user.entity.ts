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
import { Shift } from '../shifts/shifts.entity';
import { JobCategory } from '../job-categories/job-category.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  user_id!: string;

  @Column({
    length: 100,
  })
  first_name!: string;

  @Column({
    length: 100,
  })
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

  // Designation Relation
  @ManyToOne(() => Designation, (designation) => designation.users)
  @JoinColumn({
    name: 'designation_id',
  })
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

  // Role Relation
  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({
    name: 'role_id',
  })
  role!: Role;

  // Department Relation
  @ManyToOne(() => Department, (department) => department.users)
  @JoinColumn({
    name: 'department_id',
  })
  department!: Department;

  // Shift Relation
  @ManyToOne(() => Shift, (shift) => shift.users)
  @JoinColumn({
    name: 'shift_id',
  })
  shift!: Shift;

  // Job Category Relation
  @ManyToOne(() => JobCategory, (jobCategory) => jobCategory.users)
  @JoinColumn({
    name: 'job_category_id',
  })
  jobCategory!: JobCategory;

  // Attendance Relation
  @OneToMany(() => Attendance, (attendance) => attendance.user)
  attendance!: Attendance[];

  // Leave Requests Created By User
  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.user)
  leaveRequests!: LeaveRequest[];

  // Leave Requests Approved By User
  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.approved_by)
  approvedLeaveRequests!: LeaveRequest[];

  // Appraisal Questions Created By User
  @OneToMany(
    () => AppraisalQuestion,
    (appraisalQuestion) => appraisalQuestion.user,
  )
  appraisalQuestions!: AppraisalQuestion[];

  // Performance Reviews
  @OneToMany(
    () => PerformanceReview,
    (performanceReview) => performanceReview.user,
  )
  performanceReviews!: PerformanceReview[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
