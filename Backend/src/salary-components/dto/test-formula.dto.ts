import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * "Test Rule" request (spec §15): evaluate a formula against a set of sample
 * variable values so HR sees the result before saving a component.
 *
 * `sample` is a partial map of PAYROLL_VARIABLES → number. Any variable the
 * caller omits falls back to the endpoint's built-in demo values, so a quick
 * test needs no inputs at all. The service validates the formula against the
 * safe evaluator's whitelist and returns either the number or a readable error.
 */
export class TestFormulaDto {
  @ApiProperty({
    example: 'BASIC * 0.1',
    description: 'Formula over approved variables.',
  })
  @IsString()
  @MaxLength(1000)
  formula!: string;

  @ApiPropertyOptional({
    example: { BASIC: 100000, WORKING_DAYS: 26, PRESENT_DAYS: 24 },
    description:
      'Optional variable overrides. Omitted variables use built-in demo values.',
  })
  @IsOptional()
  @IsObject()
  sample?: Record<string, number>;
}
