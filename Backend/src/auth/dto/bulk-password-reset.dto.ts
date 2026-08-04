import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Upper bound on one batch.
 *
 * Each target costs a transaction, a render and an insert, and the whole batch
 * runs inside one request. 100 keeps the worst case inside a normal HTTP timeout
 * and, more to the point, bounds the damage of a mistaken "select all" on a
 * 5,000-employee list: sending every employee a reset link is not something to
 * be one careless click away from.
 */
export const MAX_RESET_LINK_BATCH = 100;

export class BulkPasswordResetDto {
  @ApiProperty({
    description: `Employees to send a reset link to. Max ${MAX_RESET_LINK_BATCH} per request.`,
    type: [String],
    format: 'uuid',
    example: ['3f1c2a7e-5b6d-4a91-8c02-9d3e7f4b1a20'],
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Select at least one employee' })
  @ArrayMaxSize(MAX_RESET_LINK_BATCH, {
    message: `Select at most ${MAX_RESET_LINK_BATCH} employees per request`,
  })
  // Duplicates would otherwise issue two tokens for one person, and because each
  // issue invalidates the previous, the first link would be dead on arrival — the
  // employee gets two emails and the older one silently fails.
  @ArrayUnique({ message: 'The same employee is listed more than once' })
  @IsUUID('4', { each: true, message: 'Each employee id must be a valid UUID' })
  user_ids!: string[];
}

/** Per-target result. Returned for every requested id, in the requested order. */
export interface BulkPasswordResetResult {
  user_id: string;
  status: 'sent' | 'skipped' | 'failed';
  /** Present for `skipped` and `failed`; safe to show to the admin. */
  reason?: string;
  email?: string;
  expires_at?: string;
}

export interface BulkPasswordResetSummary {
  requested: number;
  sent: number;
  skipped: number;
  failed: number;
  results: BulkPasswordResetResult[];
}
