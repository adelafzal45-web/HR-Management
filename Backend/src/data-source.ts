import { DataSource } from 'typeorm';

import { User } from './users/user.entity';
import { Role } from './roles/roles.entity';
import { Department } from './department/department.entity';
import { Permission } from './permissions/permission.entity';
import { RolePermission } from './role-permissions/role-permissions.entity';

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
    ],

    migrations: [
        'src/migrations/*.ts',
    ],

});