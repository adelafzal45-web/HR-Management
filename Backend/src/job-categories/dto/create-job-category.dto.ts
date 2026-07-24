import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateJobCategoryDto {
  @ApiProperty({
    example: 'Software Development',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  job_category_name!: string;

  @ApiPropertyOptional({
    example: 'Develops software applications.',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
