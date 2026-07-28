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
import { Payroll } from '../payroll/payroll.entity';
import { Notification } from '../notifications/notifications.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  user_id!: string;

  @Column({
    unique: true,
    length: 20,
  })
  employee_code!: string;

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
    type: 'date',
    nullable: true,
  })
  date_of_birth?: Date;

  @Column({
    length: 10,
    nullable: true,
  })
  gender?: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  address?: string;

  @Column({
    length: 30,
  })
  employee_type!: string;

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

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  working_hours?: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  overtime_hours?: number;

  @Column({
    default: false,
  })
  is_overtime!: boolean;

  @Column({
    length: 20,
    default: 'Absent',
  })
  attendance_status!: string;

  // ==========================
  // Relationships
  // ==========================

  @ManyToOne(() => Role, (role) => role.users)
  @JoinColumn({
    name: 'role_id',
  })
  role!: Role;

  @ManyToOne(() => Department, (department) => department.users)
  @JoinColumn({
    name: 'department_id',
  })
  department!: Department;

  @ManyToOne(() => Shift, (shift) => shift.users)
  @JoinColumn({
    name: 'shift_id',
  })
  shift!: Shift;

  @ManyToOne(() => JobCategory, (jobCategory) => jobCategory.users)
  @JoinColumn({
    name: 'job_category_id',
  })
  jobCategory!: JobCategory;

  @OneToMany(() => Attendance, (attendance) => attendance.user)
  attendance!: Attendance[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.user)
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.approved_by)
  approvedLeaveRequests!: LeaveRequest[];

  @OneToMany(() => Payroll, (payroll) => payroll.user)
  payrolls!: Payroll[];

  @OneToMany(() => Notification, (notification) => notification.createdBy)
  notifications!: Notification[];

  @OneToMany(
  () => AppraisalQuestion,
  (appraisalQuestion) => appraisalQuestion.createdBy,
)
appraisalQuestions!: AppraisalQuestion[];

@OneToMany(
  () => PerformanceReview,
  (performanceReview) => performanceReview.reviewer,
)
reviewsGiven!: PerformanceReview[];

@OneToMany(
  () => PerformanceReview,
  (performanceReview) => performanceReview.reviewee,
)
reviewsReceived!: PerformanceReview[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
