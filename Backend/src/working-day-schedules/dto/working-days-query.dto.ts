import { IsUUID, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Scope selector for reading or clearing a schedule. */
export class WorkingDaysQueryDto {
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Omit for the global default',
  })
  @IsOptional()
  @IsUUID()
  department_id?: string;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Requires department_id',
  })
  @IsOptional()
  @IsUUID()
  designation_id?: string;
}
