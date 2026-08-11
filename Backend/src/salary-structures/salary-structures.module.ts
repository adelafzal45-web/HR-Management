import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  SalaryStructure,
  SalaryStructureComponent,
  SalaryStructureAssignment,
  EmployeeComponentOverride,
} from './salary-structures.entity';
import { SalaryComponent } from '../salary-components/salary-components.entity';
import { SalaryStructuresController } from './salary-structures.controller';
import { StructureAssignmentsController } from './structure-assignments.controller';
import { EmployeeOverridesController } from './employee-overrides.controller';
import { SalaryStructuresService } from './salary-structures.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalaryStructure,
      SalaryStructureComponent,
      SalaryStructureAssignment,
      EmployeeComponentOverride,
      SalaryComponent,
    ]),
    AuthorizationModule,
  ],
  controllers: [
    SalaryStructuresController,
    StructureAssignmentsController,
    EmployeeOverridesController,
  ],
  providers: [SalaryStructuresService],
  exports: [SalaryStructuresService, TypeOrmModule],
})
export class SalaryStructuresModule {}
