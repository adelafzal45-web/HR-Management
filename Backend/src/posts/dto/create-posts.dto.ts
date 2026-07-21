import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePostDto {
  @ApiProperty({ example: 'USER POST', description: 'Full title of the POST' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'This is the content of the POST', description: 'user have to write the content of the POST' })
  @IsString()
  @IsNotEmpty()
  content: string;
}
