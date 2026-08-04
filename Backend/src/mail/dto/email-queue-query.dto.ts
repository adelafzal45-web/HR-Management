import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { EMAIL_QUEUE_STATUSES } from '../entities/email-queue.entity';
import type { EmailQueueStatus } from '../entities/email-queue.entity';

/**
 * Filters for the outbound mail log.
 *
 * Extends the project-wide pagination DTO rather than redefining page/limit, so
 * this list behaves identically to every other list endpoint.
 */
export class EmailQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: EMAIL_QUEUE_STATUSES,
    description: 'Filter by delivery status',
  })
  @IsOptional()
  @IsIn(EMAIL_QUEUE_STATUSES, {
    message: `status must be one of: ${EMAIL_QUEUE_STATUSES.join(', ')}`,
  })
  status?: EmailQueueStatus;

  @ApiPropertyOptional({
    example: 'password_reset',
    description: 'Filter by template key',
  })
  @IsOptional()
  @IsString()
  template_key?: string;
}
