import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

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
import { AppraisalQuestionModule } from './appraisal-question/appraisal-question.module';
import { PerformanceReviewModule } from './performance-review/performance-review.module';
import { AppraisalQuestionOptionsModule } from './apprisal-question-options/apprisal-question-options.module';
import { PerformanceReviewAnswerModule } from './performance-review-answer/performance-review-answer.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { AppraisalFormsModule } from './appraisal-forms/appraisal-forms.module';
import { AppraisalFormQuestionsModule } from './appraisal-form-questions/appraisal-form-questions.module';
import { AuthModule } from './auth/auth.module';
import { AppraisalFacadeModule } from './appraisal-facade/appraisal-facade.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { LeaveTypesModule } from './leave-types/leave-types.module';
import { WorkingDaySchedulesModule } from './working-day-schedules/working-day-schedules.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { AppraisalNotificationsModule } from './appraisal-notifications/appraisal-notifications.module';
import { EmployeeDocumentsModule } from './employee-documents/employee-documents.module';
import { HolidaysModule } from './holidays/holidays.module';
import { LeaveEntitlementsModule } from './leave-entitlements/leave-entitlements.module';
import { MeetingsModule } from './meetings/meetings.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',

      host: 'localhost',

      port: 5432,

      username: 'postgres',

      password: 'admin',

      database: 'HR',

      autoLoadEntities: true,

      synchronize: false,

      migrationsRun: false,

      migrations: [__dirname + '/migrations/*{.ts,.js}'],
    }),

    // Enables @Cron across the app. Registered once here rather than inside the
    // feature module that needs it, so the scheduler is an explicit application
    // capability instead of a side-effect of importing MailModule.
    ScheduleModule.forRoot(),

    UserModule,

    EmployeeDocumentsModule,

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

    AppraisalQuestionModule,

    PerformanceReviewModule,

    AppraisalQuestionOptionsModule,

    PerformanceReviewAnswerModule,

    AuthorizationModule,

    AppraisalFormsModule,

    AppraisalFormQuestionsModule,

    // Registers the global JwtAuthGuard (APP_GUARD) and mounts POST /auth/login.
    // Must be present for `request.user` to exist by the time PermissionGuard runs.
    AuthModule,

    // Single HTTP surface for the appraisal workflow (forms, assignments,
    // evaluations, analytics).
    AppraisalFacadeModule,

    // Company details + branding (single global row).
    CompanySettingsModule,

    // Leave type catalog backing the Settings > Leave Types screen.
    LeaveTypesModule,

    // Global + per-department/designation working day configuration. Attendance
    // reads this to decide which days can count as absences.
    WorkingDaySchedulesModule,

    // Append-only trail of employee-record mutations. Exports AuditService,
    // which UserService writes to inside its own transactions.
    AuditModule,

    // Transactional email: SMTP settings, branded templates, and the outbox
    // drained by a cron. Exports MailService so feature modules can enqueue.
    MailModule,

    // Owns the appraisal notification table (shift reminders, approval and
    // reopen notices). Registered so the entity loads; the behaviour lives in
    // the facade and the appraisal scheduler.
    AppraisalNotificationsModule,

    // Company holiday calendar; excluded from leave day counts alongside
    // weekends.
    HolidaysModule,

    // Leave Balance & Entitlement system: yearly grants, the leave-history
    // ledger, and the working-day-aware day counter LeaveRequestsModule uses
    // to deduct/restore balance on approval.
    LeaveEntitlementsModule,

    // Meeting scheduling and invitations. Participants are resolved from a
    // chosen audience (specific people, a department, or everyone) and notified
    // by email and/or in-app notification per the organizer's choice.
    MeetingsModule,
  ],

  controllers: [AppController],

  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserMiddleware).forRoutes('*');
  }
}