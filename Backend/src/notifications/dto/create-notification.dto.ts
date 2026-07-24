import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty({
    example: 'Company Holiday',
    description: 'Notification title',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    example: 'Office will remain closed on Friday.',
    description: 'Notification message',
  })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({
    example: 'Announcement',
    description: 'Notification type',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  type?: string;

  @ApiProperty({
    example: 'b2c8f0f2-8d8b-4d89-bfe2-66e4c6f12abc',
    description: 'UUID of the Admin or HR creating the notification',
  })
  @IsUUID()
  createdBy!: string;
}