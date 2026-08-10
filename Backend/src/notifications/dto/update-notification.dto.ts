import { PartialType, PickType } from '@nestjs/swagger';
import { CreateNotificationDto } from './create-notification.dto';

/**
 * Editing a sent notification changes its wording, not who has it.
 *
 * Deliberately not `PartialType(CreateNotificationDto)`: that would expose the
 * audience fields, and there is no coherent answer for re-targeting after
 * delivery — recipients dropped from the audience have already read it, and
 * recipients added would receive something dated to the original send. Deleting
 * and re-sending is the honest way to reach a different audience.
 *
 * The fields below apply to every row in the batch, so a corrected typo reaches
 * everyone who received it.
 */
export class UpdateNotificationDto extends PartialType(
  PickType(CreateNotificationDto, ['title', 'message', 'category'] as const),
) {}
