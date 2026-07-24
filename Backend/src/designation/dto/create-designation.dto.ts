import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

export class CreateDesignationDto {
  @ApiProperty({
    example: 'Senior Software Engineer',
    description: 'Designation title of the employee',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;
}
