import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Ask the engine to compute a payslip without persisting it (spec §14, the
 * "Preview with Why?" screen). Both ids are required — preview is always for a
 * specific employee in a specific period.
 */
export class PreviewPayslipDto {
  @ApiProperty({ description: 'Employee (user) UUID.' })
  @IsUUID()
  user_id!: string;

  @ApiProperty({ description: 'Payroll period UUID.' })
  @IsUUID()
  period_id!: string;
}
