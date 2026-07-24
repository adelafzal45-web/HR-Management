import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { UserModule } from './users/users.module';
import { RoleModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { DepartmentsModule } from './department/department.module';
import { RolePermissionsModule } from './role-permissions/role-permissions.module';

import { UserMiddleware } from './middleware/user.middleware';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { DesignationModule } from './designation/designation.module';
import { ShiftsModule } from './shifts/shifts.module';
import { JobCategoriesModule } from './job-categories/job-categories.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',

      host: 'localhost',

      port: 5432,

      username: 'postgres',

      password: '123454321',

      database: 'HR',

      autoLoadEntities: true,

      synchronize: false,

      migrationsRun: false,

      migrations: [__dirname + '/migrations/*{.ts,.js}'],
    }),

    UserModule,

    RoleModule,

    PermissionsModule,

    DepartmentsModule,

    RolePermissionsModule,

    AttendanceModule,

    LeaveRequestsModule,

    DesignationModule,

    ShiftsModule,

    JobCategoriesModule,

    NotificationsModule,

    PayrollModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserMiddleware).forRoutes('*');
  }
}
