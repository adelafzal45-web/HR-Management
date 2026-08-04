import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { EvaluationType } from '../../appraisal-forms/appraisal-forms.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Splits a comma-joined query param into an array.
 *
 * Query strings have no array type, so `?employeeIds=a,b,c` is the form the
 * frontend can actually produce from a multi-select. A single value arrives as a
 * string and still has to become a one-element array, or `@IsArray` rejects it.
 */
const toIdArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
};

/**
 * The filter set shared by the stats module, the results table, and the export
 * endpoints, so a PDF or spreadsheet always covers exactly what is on screen.
 *
 * Every field is optional. Omitting all of them is a legitimate "everything, all
 * time" request, and the service caps the row count rather than the date range —
 * a required date range would make the first page load of a fresh install empty.
 */
export class StatsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Inclusive.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Inclusive.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: EvaluationType })
  @IsOptional()
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;

  @ApiPropertyOptional({
    description: 'Draft | Submitted | Approved | Rejected',
  })
  @IsOptional()
  status?: string;
}

/**
 * Two to six employees for the comparison view.
 *
 * The lower bound is what makes it a comparison; the upper bound is the point past
 * which a grouped bar chart and a ranking table stop being readable, and it also
 * bounds the per-employee trend queries behind one request.
 */
export class CompareStatsQueryDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Comma-separated or repeated. 2–6 employees.',
  })
  @Transform(toIdArray)
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @IsUUID('4', { each: true })
  employeeIds!: string[];

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: EvaluationType })
  @IsOptional()
  @IsEnum(EvaluationType)
  evaluationType?: EvaluationType;
}
