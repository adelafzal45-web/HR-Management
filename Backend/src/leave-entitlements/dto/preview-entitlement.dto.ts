import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

import { EntitlementTargetDto } from './entitlement-target.dto';

export class PreviewEntitlementDto {
  @ApiProperty({ description: 'Leave type to preview balances for.' })
  @IsUUID('4')
  leave_type_id!: string;

  @ApiProperty({ example: 2026 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiProperty({ type: EntitlementTargetDto })
  @ValidateNested()
  @Type(() => EntitlementTargetDto)
  target!: EntitlementTargetDto;
}
