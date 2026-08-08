import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
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
    summary: 'Create a new notification',
    description: 'Allows an Admin or HR to create a new notification.',
  })
  @ApiResponse({
    status: 201,
    description: 'Notification created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('notifications.view')
  @ApiOperation({
    summary: 'Get all notifications',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all notifications.',
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
    summary: 'Update a notification',
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
    summary: 'Delete a notification',
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
