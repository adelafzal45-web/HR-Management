import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Shared query params for every paginated list endpoint.
 *
 * Usage in a controller:
 *   findAll(@Query() query: PaginationQueryDto) { ... }
 *
 * The service turns these into TypeORM `skip`/`take` + `ORDER BY` + an
 * `ILIKE` search across whitelisted columns.
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Free-text search term' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Column to sort by' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  sortOrder?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }

  get order(): 'ASC' | 'DESC' {
    return (this.sortOrder ?? 'DESC').toUpperCase() as 'ASC' | 'DESC';
  }

  /*
   * `skip` and `order` are derived, but class-transformer assigns *every* query
   * key onto the instance before validation strips unknown ones. A request with
   * `?order=DESC` or `?skip=10` would therefore hit a getter-only property and
   * throw a TypeError — a 500 on any paginated endpoint, from a query string
   * alone. These setters swallow the assignment; `sortBy`/`sortOrder`/`page`
   * remain the only inputs that actually steer the query.
   */
  set skip(_ignored: number) {}

  set order(_ignored: 'ASC' | 'DESC') {}
}

/** Consistent envelope for paginated list responses. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function paginatedResult<T>(
  data: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  return {
    data,
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}
