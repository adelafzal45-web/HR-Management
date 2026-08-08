import { OmitType } from '@nestjs/swagger';

import { CreateLeaveRequestDto } from './create-leave-request.dto';

/**
 * Body for `POST /leave-requests/me` — the employee's own Apply Leave form.
 *
 * The three omitted fields are exactly the ones an employee must not be able
 * to choose, because that route has no permission gate and is scoped to the
 * caller's token:
 *
 *   - `user_id`      taken from the verified token, so leave cannot be filed
 *                    against another employee's balance.
 *   - `status`       forced to Pending, so a request cannot arrive
 *                    pre-approved and deduct balance without an approver.
 *   - `approved_by_id` likewise — the employee does not name their approver.
 *
 * `reason` stays optional on the parent DTO (HR backfills historical records
 * without one) but is enforced as mandatory by `createForUser`.
 */
export class CreateSelfLeaveRequestDto extends OmitType(CreateLeaveRequestDto, [
  'user_id',
  'status',
  'approved_by_id',
] as const) {}
