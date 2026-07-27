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
import { PerformanceReview } from './performance-review/performance-review.entity';
export const AppDataSource = new DataSource({
  type: 'postgres',

  host: 'localhost',

  port: 5432,

  username: 'postgres',

  password: '123454321',

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
    PerformanceReview,
  ],

  migrations: ['src/migrations/*.ts'],
});
