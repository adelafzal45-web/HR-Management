import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  EvaluationType,
  FormStatus,
} from '../../appraisal-forms/appraisal-forms.entity';

/**
 * Sort fields the forms list accepts.
 *
 * `questionCount`, `activeWeightTotal` and `reviewCount` are not columns on
 * `appraisal_forms` — they aggregate related rows — so the service sorts them
 * with correlated subqueries rather than a plain ORDER BY. They are whitelisted
 * here so an arbitrary `?sortBy=` string can never reach the query builder.
 */
export const FORM_SORT_FIELDS = [
  'formName',
  'evaluationType',
  'status',
  'questionCount',
  'activeWeightTotal',
  'reviewCount',
  'createdAt',
  'updatedAt',
] as const;

export type FormSortField = (typeof FORM_SORT_FIELDS)[number];

/**
 * Query params for `GET /appraisal/forms`.
 *
 * Page sizes are capped at 100 to match the four options the Forms table offers
 * (10 / 25 / 50 / 100). Filters mirror the columns the table renders, so a
 * filter and the row it hides can never disagree about the same form.
 */
export class FormQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search across form name and description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: FormStatus })
  @IsOptional()
  @IsIn(Object.values(FormStatus))
  status?: FormStatus;

  @ApiPropertyOptional({ enum: EvaluationType })
  @IsOptional()
  @IsIn(Object.values(EvaluationType))
  evaluationType?: EvaluationType;

  @ApiPropertyOptional({
    description: 'Only forms assigned to this department.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Only forms assigned to this designation.',
  })
  @IsOptional()
  @IsUUID()
  designationId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: 25,
    minimum: 1,
    maximum: 100,
    description: 'Rows per page. The table offers 10 / 25 / 50 / 100.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;

  @ApiPropertyOptional({ enum: FORM_SORT_FIELDS, default: 'updatedAt' })
  @IsOptional()
  @IsIn(FORM_SORT_FIELDS)
  sortBy?: FormSortField;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: string = 'DESC';

  get order(): 'ASC' | 'DESC' {
    return (this.sortOrder ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  }

  /*
   * class-transformer assigns every query key onto the instance before
   * validation strips the unknown ones, so `?order=DESC` would otherwise hit a
   * getter-only property and throw — a 500 from a query string alone. Mirrors
   * the guard on PaginationQueryDto.
   */
  set order(_ignored: 'ASC' | 'DESC') {}
}

/** Envelope the forms list returns. */
export interface FormListResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
