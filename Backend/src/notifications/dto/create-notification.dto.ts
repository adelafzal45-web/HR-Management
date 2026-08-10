import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  NotificationAudienceType,
  NotificationCategory,
} from '../notifications.entity';

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
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  // The column is `text`, so this is a product limit rather than a storage one:
  // it matches the compose form's cap so a message that the UI accepts is a
  // message the server accepts, and an over-long one from any other client is
  // refused outright instead of being silently stored at full length.
  @MaxLength(2000)
  message!: string;

  @ApiPropertyOptional({
    enum: NotificationCategory,
    default: NotificationCategory.GENERAL,
    description:
      'What the notice is about. Drives the bell icon and the category filter.',
  })
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;

  @ApiProperty({
    enum: NotificationAudienceType,
    default: NotificationAudienceType.ALL,
    description:
      'How the recipient list is chosen. Specific = the recipient_ids below; ' +
      'Department = every active member of audience_department_id; ' +
      'All = every active employee. The sender is not included.',
  })
  @IsEnum(NotificationAudienceType)
  audience_type!: NotificationAudienceType;

  @ApiPropertyOptional({
    example: '9c8f2a1e-4b7d-4f2a-8e11-6d3c5b9a2f70',
    description: 'Department UUID. Required when audience_type is Department.',
  })
  @ValidateIf(
    (dto: CreateNotificationDto) =>
      dto.audience_type === NotificationAudienceType.DEPARTMENT,
  )
  @IsUUID()
  audience_department_id?: string;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Recipient user UUIDs. Required when audience_type is Specific; ignored ' +
      'for Department and All, which resolve their own lists server-side.',
  })
  @ValidateIf(
    (dto: CreateNotificationDto) =>
      dto.audience_type === NotificationAudienceType.SPECIFIC,
  )
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  recipient_ids?: string[];

  // ------------------------------------------------------------------
  // Optional attachment
  // ------------------------------------------------------------------
  // Composing is two steps: the file goes to POST /notifications/attachment
  // first, which validates and stores it, and the metadata it returns is echoed
  // back here. That keeps this endpoint plain JSON, and means a rejected file
  // costs nothing — it is refused before an audience has been resolved or a
  // single row written.
  //
  // These are not trusted blindly: `attachment_url` must name a file this
  // server issued, which the service checks against the upload prefix. A caller
  // cannot point a notification at an arbitrary URL through this field.

  @ApiPropertyOptional({
    example: '/uploads/notification-attachments/9f3c1e08-4b7d-4f2a-8e11.pdf',
    description:
      'Server path returned by POST /notifications/attachment. Must be a path ' +
      'this server issued; external URLs are rejected.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachment_url?: string;

  @ApiPropertyOptional({
    example: 'holiday-policy-2026.pdf',
    description: "The file's original name, used for the download prompt.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  attachment_name?: string;

  @ApiPropertyOptional({ example: 'application/pdf' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  attachment_mime?: string;

  @ApiPropertyOptional({ example: 248193, description: 'Size in bytes.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  attachment_size?: number;

  // `createdBy` is deliberately absent.
  //
  // It used to be a required body field, which meant any caller holding
  // `notifications.create` could attribute a notification to somebody else —
  // the recipient sees "from <name>", so that is a forgeable sender line, not a
  // cosmetic detail. The author is now taken from the verified JWT in the
  // controller, the same source every other write in this codebase trusts.
}
