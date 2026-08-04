import {
  IsUUID,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkingDayEntryDto {
  @ApiProperty({
    example: 1,
    description: 'ISO day of week: 1 = Monday ... 7 = Sunday',
    minimum: 1,
    maximum: 7,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(7)
  day_of_week!: number;

  @ApiProperty({
    example: true,
    description: 'Whether this day is a working day for the given scope',
  })
  @IsBoolean()
  is_working!: boolean;
}

/**
 * Replaces the full week for one scope in a single call.
 *
 * A week is edited as a unit in the UI, so PUT-style replacement avoids the
 * partial-update races you get when seven days are patched one at a time.
 *
 * Scope is implied by which ids are present:
 *   - neither                 -> global default
 *   - department_id           -> department override
 *   - department + designation-> designation override
 */
export class SetWorkingDaysDto {
  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Omit for the global default',
  })
  @IsOptional()
  @IsUUID()
  department_id?: string;

  @ApiPropertyOptional({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    description: 'Requires department_id. Omit for a department-wide override.',
  })
  @IsOptional()
  @IsUUID()
  designation_id?: string;

  @ApiProperty({
    type: [WorkingDayEntryDto],
    description:
      'The week for this scope. Days omitted here are treated as non-working.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkingDayEntryDto)
  days!: WorkingDayEntryDto[];
}
