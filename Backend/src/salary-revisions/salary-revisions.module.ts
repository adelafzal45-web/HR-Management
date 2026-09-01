import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SalaryRevision } from './salary-revisions.entity';
import { SalaryRevisionsController } from './salary-revisions.controller';
import { SalaryRevisionsService } from './salary-revisions.service';
import { SalaryStructureAssignment } from '../salary-structures/salary-structures.entity';
import { AuthorizationModule } from '../authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Salary revisions (increment/decrement with history).
 *
 * Registers its own table plus the salary-structure assignment repository (read
 * only, to detect a base_salary that would mask a revision). AuditModule
 * supplies AuditService for the trail; AuthorizationModule supplies the guard
 * behind the reused `employees.salary.*` permissions.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SalaryRevision, SalaryStructureAssignment]),
    AuthorizationModule,
    AuditModule,
  ],
  controllers: [SalaryRevisionsController],
  providers: [SalaryRevisionsService],
  exports: [SalaryRevisionsService],
})
export class SalaryRevisionsModule {}
