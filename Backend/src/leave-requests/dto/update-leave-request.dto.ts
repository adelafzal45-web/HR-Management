import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CreateLeaveRequestDto } from './create-leave-request.dto';

export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {
  @ApiPropertyOptional({
    example: '0ab49780-8dc6-4c3b-9eb0-a7c3f8365c12',
    description:
      'UUID of the HR/Manager approving the leave request. Temporary field for development until authentication is implemented.',
  })
  @IsOptional()
  @IsUUID()
  approved_by_id?: string;
}
