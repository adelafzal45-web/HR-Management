import { DataSource } from 'typeorm';

import { User } from './users/user.entity';
import { Role } from './roles/roles.entity';
import { Department } from './department/department.entity';
import { Permission } from './permissions/permission.entity';
import { RolePermission } from './role-permissions/role-permissions.entity';
import { LeaveRequest } from './leave-requests/leave-requests.entity';
import { Attendance } from './attendance/attendance.entity';

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
  ],

  migrations: ['src/migrations/*.ts'],
});
