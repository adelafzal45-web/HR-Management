import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuthorizationModule } from '../authorization/authorization.module';

/**
 * Audit trail for employee-record mutations.
 *
 * Exports AuditService so feature modules (UserModule first) can record their
 * own writes inside the same transaction as the change itself.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog]), AuthorizationModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
