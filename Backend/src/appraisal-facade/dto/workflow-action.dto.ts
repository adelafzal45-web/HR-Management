import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The note attached to an approve / reject / reopen.
 *
 * Optional on approve, required on reject and reopen — the service enforces that,
 * not the DTO, because the requirement is per-action and a single shape keeps all
 * three endpoints identical to call. The reviewer sees the note verbatim in their
 * notification, so it is the only explanation they get for why their submitted
 * form came back.
 */
export class WorkflowActionDto {
  @ApiPropertyOptional({
    example:
      'Scores look inconsistent with the attendance record — please revisit.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
