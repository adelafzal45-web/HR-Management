import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthorizationModule } from '../authorization/authorization.module';
import { User } from '../users/user.entity';
import { EmployeeDocument } from './employee-document.entity';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { EmployeeDocumentsService } from './employee-documents.service';

/**
 * `User` is registered here only so the service can read employee codes for the
 * export's folder names and confirm an employee exists before storing files —
 * it does not own or write that table.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeDocument, User]),
    AuthorizationModule,
  ],
  controllers: [EmployeeDocumentsController],
  providers: [EmployeeDocumentsService],
  exports: [EmployeeDocumentsService],
})
export class EmployeeDocumentsModule {}
