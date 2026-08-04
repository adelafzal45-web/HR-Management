import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * The query shape the Settings workspace actually sends: `?search=&page=&pageSize=`.
 *
 * Deliberately not `PaginationQueryDto` (page/`limit`, max 100), which is the
 * house style elsewhere. The six Settings list screens share one client-side
 * `qs()` builder that has emitted `pageSize` since before that DTO existed, and
 * one of its callers — the Roles screen's permission picker — asks for every
 * permission in one request (`pageSize=1000`) to render its checkbox tree.
 * Renaming the param would mean touching all six screens at once; reusing the
 * max-100 cap would silently truncate that picker to the first 100 permissions,
 * which is precisely the kind of quiet wrong answer this module keeps producing.
 *
 * `pageSize` is optional and omitting it returns every row with `total` set to
 * the full count, so a caller that just wants "all of them" — or an older client
 * that sends no query at all — keeps working unchanged.
 */
export class SettingsListQueryDto {
  @ApiPropertyOptional({
    description: 'Free-text search, matched case-insensitively against name and description.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 1000,
    description: 'Rows per page. Omit to return every row.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number;
}

/** Envelope every Settings list endpoint returns. */
export interface SettingsListResult<T> {
  data: T[];
  total: number;
}

/**
 * Escape the LIKE wildcards in a user-typed search term.
 *
 * Without this, searching for `_` or `%` matches every row rather than the rows
 * containing that character — the search box appears to do nothing, which is
 * indistinguishable from it being unwired.
 */
export function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}
