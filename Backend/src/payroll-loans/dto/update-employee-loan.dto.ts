import { PartialType } from '@nestjs/mapped-types';

import { CreateEmployeeLoanDto } from './create-employee-loan.dto';

/**
 * Every loan field is patchable. Changing `installment_amount` or `principal`
 * does not regenerate the schedule — re-run `POST /payroll-loans/:id/schedule`
 * for that. `outstanding` is engine-owned and not exposed here.
 */
export class UpdateEmployeeLoanDto extends PartialType(CreateEmployeeLoanDto) {}
