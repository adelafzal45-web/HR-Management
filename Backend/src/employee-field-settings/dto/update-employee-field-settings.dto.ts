import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

import { EMPLOYEE_CONFIGURABLE_FIELDS } from '../../users/dto/validation.constants';

/**
 * PATCH body for the employee field settings.
 *
 * `field_config` is a PARTIAL map of `fieldKey -> required(boolean)`: a client
 * sends only the toggles it changed and omitted fields keep their current
 * value. The allowed keys and the boolean value type are validated in the
 * service against `EMPLOYEE_CONFIGURABLE_FIELDS` — a class-validator decorator
 * can't cleanly check a dynamic key set, and `@IsObject()` alone would wave
 * through `{ phone: "yes" }` or an unknown field.
 */
export class UpdateEmployeeFieldSettingsDto {
  @ApiPropertyOptional({
    description: `Map of employee field key -> required flag. Allowed keys: ${EMPLOYEE_CONFIGURABLE_FIELDS.join(', ')}.`,
    example: { phone: false, address: true },
  })
  @IsOptional()
  @IsObject()
  field_config?: Record<string, boolean>;
}
