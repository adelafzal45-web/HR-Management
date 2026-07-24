import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';

import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post()
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

  @Get(':id')
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateNotificationDto,
  ) {
    return this.notificationsService.update(id, dto);
  }

  @Delete(':id')
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