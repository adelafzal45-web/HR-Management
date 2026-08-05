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
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import { UserLeaveBalance } from './user-leave-balance.entity';
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

  /**
   * 128x128 WebP derivative of `profile_image`, written at upload time.
   *
   * Stored rather than derived on request so a 40px avatar in a 50-row list does
   * not download 50 full-size photos. Nullable and independent of
   * `profile_image`: thumbnail generation is allowed to fail without failing the
   * upload, and readers fall back to the full image when it is absent.
   */
  @Column({
    length: 500,
    nullable: true,
  })
  profile_image_thumb?: string;

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

  /**
   * Legacy free-text address.
   *
   * Superseded by the structured columns below. Kept so existing readers keep
   * working; EmployeeManagementSchema1786800000000 backfilled `street_address`
   * from it rather than trying to parse it into parts.
   */
  @Column({
    type: 'text',
    nullable: true,
  })
  address?: string;

  // ==========================
  // Structured address
  // ==========================

  @Column({
    type: 'text',
    nullable: true,
  })
  street_address?: string;

  @Column({
    length: 100,
    nullable: true,
  })
  city?: string;

  @Column({
    length: 100,
    nullable: true,
  })
  state_province?: string;

  @Column({
    length: 20,
    nullable: true,
  })
  postal_code?: string;

  @Column({
    length: 100,
    nullable: true,
  })
  country?: string;

  // ==========================
  // Emergency contact
  // ==========================

  @Column({
    length: 150,
    nullable: true,
  })
  emergency_contact_name?: string;

  @Column({
    length: 60,
    nullable: true,
  })
  emergency_contact_relationship?: string;

  @Column({
    length: 20,
    nullable: true,
  })
  emergency_contact_phone?: string;

  // ==========================
  // Bank / payroll details
  // ==========================

  @Column({
    length: 150,
    nullable: true,
  })
  bank_name?: string;

  @Column({
    length: 40,
    nullable: true,
  })
  bank_account_number?: string;

  @Column({
    length: 20,
    nullable: true,
  })
  bank_routing_code?: string;

  /** Printed on the ID card when present. */
  @Column({
    length: 5,
    nullable: true,
  })
  blood_group?: string;

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

  /**
   * Monthly gross pay.
   *
   * `decimal` comes back from pg as a string, so it is parsed on read for the
   * same reason as the leave-balance columns: without it the API emits
   * `"120000.50"` where clients expect a number, and any arithmetic on it
   * concatenates instead of adding.
   */
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value?: number | null) => value ?? null,
      from: (value: string | number | null) =>
        value === null || value === undefined ? undefined : Number(value),
    },
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
  // Account state flags
  //
  // Only genuine account state lives here. Module access (payroll, leave,
  // appraisal, reports…) is modelled by the RBAC role/permission graph, not
  // duplicated as columns — a second copy would inevitably disagree with the
  // first. These answer "can this account authenticate, and through which
  // channel", which RBAC does not cover.
  // ==========================

  /** Master switch. When false, login is refused regardless of credentials. */
  @Column({
    default: true,
  })
  login_enabled!: boolean;

  @Column({
    default: true,
  })
  password_reset_allowed!: boolean;

  @Column({
    default: true,
  })
  web_login_allowed!: boolean;

  @Column({
    default: true,
  })
  mobile_login_allowed!: boolean;

  @Column({
    default: false,
  })
  api_access_allowed!: boolean;

  @Column({
    default: true,
  })
  multi_device_login_allowed!: boolean;

  @Column({
    default: false,
  })
  remote_attendance_allowed!: boolean;

  @Column({
    default: false,
  })
  biometric_attendance_allowed!: boolean;

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

  // ==========================
  // Team Lead hierarchy
  //
  //   Department
  //     ├── Team Lead A ──> Employee 1, 2, 3
  //     ├── Team Lead B ──> Employee 4, 5
  //     └── Team Lead C
  //
  // Self-referencing: a Team Lead is a User who holds the Team Lead role and
  // has other Users pointing at them. An employee reports to at most one lead.
  //
  // ON DELETE SET NULL — removing a lead must not cascade-delete their
  // reports. The "lead must be in the same department as the member" rule
  // cannot be expressed as a SQL constraint (no cross-row CHECK), so it is
  // enforced in UserService on every write.
  // ==========================

  @ManyToOne(() => User, (user) => user.teamMembers, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'team_lead_id',
  })
  teamLead?: User | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  team_lead_id?: string | null;

  @OneToMany(() => User, (user) => user.teamLead)
  teamMembers!: User[];

  @OneToMany(() => UserLeaveBalance, (balance) => balance.user)
  leaveBalances!: UserLeaveBalance[];

  @OneToMany(() => Attendance, (attendance) => attendance.user)
  attendance!: Attendance[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.user)
  leaveRequests!: LeaveRequest[];

  @OneToMany(() => LeaveRequest, (leaveRequest) => leaveRequest.approved_by)
  approvedLeaveRequests!: LeaveRequest[];

  @OneToMany(() => Payroll, (payroll) => payroll.user)
  payrolls!: Payroll[];

  @OneToMany(() => Notification, (notification) => notification.user)
  notifications!: Notification[];

  @OneToMany(() => Notification, (notification) => notification.createdBy)
  createdNotifications!: Notification[];

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

  @OneToMany(() => AppraisalForms, (appraisalForm) => appraisalForm.createdBy)
  createdAppraisalForms!: AppraisalForms[];
  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
