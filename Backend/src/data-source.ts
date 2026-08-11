import { DataSource } from 'typeorm';

import { databaseConfig } from './config/database.config';

import { User } from './users/user.entity';
import { Role } from './roles/roles.entity';
import { Department } from './department/department.entity';
import { Permission } from './permissions/permission.entity';
import { RolePermission } from './role-permissions/role-permissions.entity';
import { LeaveRequest } from './leave-requests/leave-requests.entity';
import { Attendance } from './attendance/attendance.entity';
import { Designation } from './designation/designation.entity';
import { Shift } from './shifts/shifts.entity';
import { JobCategory } from './job-categories/job-category.entity';
import { Notification } from './notifications/notifications.entity';
import { Payroll } from './payroll/payroll.entity';

import { AppraisalQuestion } from './appraisal-question/appraisal-question.entity';
import { AppraisalQuestionOption } from './apprisal-question-options/apprisal-question-options.entity';

import { AppraisalForms } from './appraisal-forms/appraisal-forms.entity';
import { AppraisalFormAssignment } from './appraisal-forms/appraisal-form-assignment.entity';
import {
  TeamLeadAssignment,
  TeamLeadAssignmentMember,
} from './appraisal-forms/team-lead-assignment.entity';
import { AppraisalFormQuestion } from './appraisal-form-questions/appraisal-form-questions.entity';

import { PerformanceReview } from './performance-review/performance-review.entity';
import { ReviewApproval } from './performance-review/review-approval.entity';
import { PerformanceReviewAnswer } from './performance-review-answer/performance-review-answer.entity';
import { AppraisalNotification } from './appraisal-notifications/appraisal-notification.entity';

import { RefreshToken } from './auth/refresh-token.entity';

import { CompanySettings } from './company-settings/company-settings.entity';
import { LeaveType } from './leave-types/leave-types.entity';
import { WorkingDaySchedule } from './working-day-schedules/working-day-schedules.entity';
import { UserLeaveBalance } from './users/user-leave-balance.entity';
import { AuditLog } from './audit/audit-log.entity';
import { EmployeeDocument } from './employee-documents/employee-document.entity';
import { Holiday } from './holidays/holiday.entity';
import { LeaveEntitlement } from './leave-entitlements/leave-entitlement.entity';
import { LeaveHistory } from './leave-entitlements/leave-history.entity';

import { PayrollRule } from './payroll-rules/payroll-rules.entity';
import { TaxConfig, TaxSlab } from './payroll-tax/payroll-tax.entity';
import {
  EmployeeLoan,
  LoanInstallment,
} from './payroll-loans/payroll-loans.entity';

/**
 * The DataSource the TypeORM CLI uses to generate, run and revert migrations
 * (see the `typeorm` script in package.json).
 *
 * Connection settings come from `databaseConfig`, the same object `app.module.ts`
 * builds its connection from, so the CLI cannot end up migrating a different
 * database than the one the application serves.
 */
export const AppDataSource = new DataSource({
  ...databaseConfig,

  entities: [
    User,
    Role,
    Department,
    Permission,
    RolePermission,
    Attendance,
    LeaveRequest,
    Designation,
    Shift,
    JobCategory,
    Notification,
    Payroll,
    AppraisalQuestion,
    AppraisalQuestionOption,
    AppraisalForms,
    AppraisalFormAssignment,
    TeamLeadAssignment,
    TeamLeadAssignmentMember,
    AppraisalFormQuestion,
    PerformanceReview,
    ReviewApproval,
    PerformanceReviewAnswer,
    AppraisalNotification,
    RefreshToken,
    CompanySettings,
    LeaveType,
    WorkingDaySchedule,
    UserLeaveBalance,
    AuditLog,
    EmployeeDocument,
    Holiday,
    LeaveEntitlement,
    LeaveHistory,
    PayrollRule,
    TaxConfig,
    TaxSlab,
    EmployeeLoan,
    LoanInstallment,
  ],

  migrations: ['src/migrations/*.ts'],
});