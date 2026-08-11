import { PartialType } from '@nestjs/mapped-types';

import { CreatePayrollPeriodDto } from './create-payroll-period.dto';

/**
 * Edit a period's descriptive fields and dates. Allowed only while the period
 * is still `draft` (enforced in the service) — once a run has been processed
 * its window is part of the payslip snapshot and must not shift under it.
 * Status changes go through the process/approve/lock endpoints, never here.
 */
export class UpdatePayrollPeriodDto extends PartialType(
  CreatePayrollPeriodDto,
) {}
