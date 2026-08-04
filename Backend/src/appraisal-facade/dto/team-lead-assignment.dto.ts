import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { TeamLeadAssignmentMode } from '../../appraisal-forms/team-lead-assignment.entity';

/**
 * Grants a Team Lead visibility over employees.
 *
 * The two modes take different companion fields, and the service validates the
 * pairing rather than ignoring the irrelevant one:
 *
 *  - `DEPARTMENT` — needs `departmentId`, rejects `memberIds`. One per lead.
 *  - `MEMBERS`    — needs `memberIds` (1–200), rejects `departmentId`.
 *
 * `memberIds` is bounded because the whole list is written in one transaction and
 * every id is validated against `users` first; an unbounded array is an
 * accidental full-table scan behind a single request.
 */
export class CreateTeamLeadAssignmentDto {
  @ApiProperty({ description: 'The Team Lead receiving the grant.' })
  @IsUUID()
  teamLeadId!: string;

  @ApiProperty({ enum: TeamLeadAssignmentMode })
  @IsEnum(TeamLeadAssignmentMode)
  mode!: TeamLeadAssignmentMode;

  @ApiPropertyOptional({
    description: 'Required for DEPARTMENT mode, rejected for MEMBERS mode.',
  })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Required for MEMBERS mode, rejected for DEPARTMENT mode.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  memberIds?: string[];
}

/** Replaces the member list of an existing MEMBERS-mode assignment wholesale. */
export class UpdateTeamLeadAssignmentMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  memberIds!: string[];
}
