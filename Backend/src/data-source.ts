import { DataSource } from 'typeorm';

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
import { TaxSlab } from './tax/tax-slab.entity';
import { Reimbursement } from './reimbursements/reimbursement.entity';
import { PayrollAdjustment } from './payroll/payroll-adjustment.entity';
import { PayrollItem} from './payroll/payroll-item.entity';
import { PayrollAuditLog } from './payroll/payroll-audit-log.entity';
import { LoanInstallment} from './loans/loan-installment.entity';
import { Loan } from './loans/loan.entity';
export const AppDataSource = new DataSource({
  type: 'postgres',

  host: 'localhost',

  port: 5432,

  username: 'postgres',

  password: 'admin',

  database: 'HR',

  synchronize: false,

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
    TaxSlab,
    Loan,
    LoanInstallment,
    Reimbursement,
    PayrollAdjustment,
    PayrollAuditLog,
    PayrollItem
  ],

  migrations: ['src/migrations/*.ts'],
});