import { PartialType } from '@nestjs/mapped-types';

import { CreateTaxConfigDto } from './create-tax-config.dto';

/**
 * Update a tax config. When `slabs` is provided the service replaces the whole
 * ladder (slabs are cheap and always edited as a set); omit it to leave the
 * existing brackets untouched.
 */
export class UpdateTaxConfigDto extends PartialType(CreateTaxConfigDto) {}
