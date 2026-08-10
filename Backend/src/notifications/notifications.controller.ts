import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFile as UploadedFileParam,
  UseInterceptors,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';

import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  type UploadedFile,
} from '../common/upload/image-upload';
import { Query, UseGuards } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.create')
  @ApiOperation({
    summary: 'Send a notification to a chosen audience',
    description:
      'Composes a notification and delivers it to every active employee in the ' +
      'chosen audience — specific people, one department, or everyone. One row ' +
      'is written per recipient, so each has their own read state. The author ' +
      'is taken from the JWT, not the body.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Delivered. Returns the batch summary, including the recipient count.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid body, or an audience that resolves to no active employees.',
  })
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto, user.user_id);
  }

  /**
   * Step one of composing with a file: upload it, get its metadata back, then
   * echo that metadata into `POST /notifications`.
   *
   * Split in two so `create` stays plain JSON, and so a bad file is refused
   * before any audience is resolved or any row written. Guarded on
   * `notifications.create` rather than a permission of its own — the ability to
   * stage an attachment is the ability to send one.
   */
  @Post('attachment')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.create')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a notification attachment',
    description: `Accepts ${ALLOWED_ATTACHMENT_MIME_TYPES.join(', ')} up to ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB. Contents are checked against the declared type, so a renamed executable is rejected. Returns the metadata to send with the notification.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Stored. Returns { url, name, mime, size }.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or oversized file.' })
  uploadAttachment(@UploadedFileParam() file: UploadedFile | undefined) {
    return this.notificationsService.saveAttachment(file);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.view')
  @ApiOperation({
    summary: 'Sent notifications',
    description:
      'One entry per notification sent, not per delivered row: the rows of a ' +
      'single send are grouped, with the audience, recipient count and read ' +
      'count.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns every sent notification, newest first.',
  })
  findAll() {
    return this.notificationsService.findAll();
  }

  /**
   * The bell: notices addressed to the JWT user, plus company-wide
   * announcements. Query `?unread=true` for the unread count alone.
   */
  @Get('me')
  @ApiOperation({ summary: 'Get my notifications' })
  @ApiQuery({
    name: 'unread',
    required: false,
    type: Boolean,
    description: 'Return only unread notices',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max 100',
  })
  @ApiResponse({ status: 200, description: 'User notifications and unread count' })
  findMine(
    @CurrentUser() user: JwtUser,
    @Query('unread') unreadOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.findForUser(user.user_id, {
      unreadOnly: unreadOnly === 'true',
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch('me/:id/read')
  @ApiOperation({ summary: 'Mark one notification read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Marked read' })
  @ApiResponse({ status: 404, description: 'Not found or not yours' })
  markRead(@CurrentUser() user: JwtUser, @Param('id') id: string) {
    return this.notificationsService.markRead(id, user.user_id);
  }

  @Post('me/read-all')
  @ApiOperation({ summary: 'Mark all my notifications read' })
  @ApiResponse({ status: 200, description: 'Batch marked read' })
  markAllRead(@CurrentUser() user: JwtUser) {
    return this.notificationsService.markAllRead(user.user_id);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.view')
  @ApiOperation({
    summary: 'Get notification by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Notification UUID',
    example: 'e7a4bb86-75fd-4b70-b96d-42ef48d4f1cb',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found.',
  })
  findOne(@Param('id') id: string) {
    return this.notificationsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.update')
  @ApiOperation({
    summary: 'Edit a sent notification',
    description:
      "Applies to every recipient's copy, so a corrected typo reaches everyone " +
      'who received it. The audience cannot be changed after sending.',
  })
  @ApiParam({
    name: 'id',
    description: 'Notification UUID',
    example: 'e7a4bb86-75fd-4b70-b96d-42ef48d4f1cb',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateNotificationDto) {
    return this.notificationsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.delete')
  @ApiOperation({
    summary: 'Delete a sent notification',
    description:
      "Removes it from every recipient's bell, not just the row named by :id.",
  })
  @ApiParam({
    name: 'id',
    description: 'Notification UUID',
    example: 'e7a4bb86-75fd-4b70-b96d-42ef48d4f1cb',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found.',
  })
  remove(@Param('id') id: string) {
    return this.notificationsService.remove(id);
  }
}
