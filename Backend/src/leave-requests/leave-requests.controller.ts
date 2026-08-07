import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import type { AuditActor } from '../audit/audit.service';

@ApiTags('Leave Requests')
@ApiBearerAuth()
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

  private actorFrom(user: JwtUser, request: Request): AuditActor {
    return {
      user_id: user.user_id,
      email: user.email,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-request.create')
  @ApiOperation({
    summary: 'Create a leave request',
    description: 'Allows an employee to submit a leave request.',
  })
  @ApiBody({
    type: CreateLeaveRequestDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Leave request created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(
    @Body() createLeaveRequestDto: CreateLeaveRequestDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.leaveRequestsService.create(
      createLeaveRequestDto,
      this.actorFrom(user, request),
    );
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-request.view')
  @ApiOperation({
    summary: 'Get all leave requests',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all leave requests.',
  })
  findAll() {
    return this.leaveRequestsService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-request.view')
  @ApiOperation({
    summary: 'Get leave request by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Leave Request UUID',
    example: '8d2c0b32-fb0b-4b73-93a1-2b7a9f5e8d3d',
  })
  @ApiResponse({
    status: 200,
    description: 'Leave request found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Leave request not found.',
  })
  findOne(@Param('id') id: string) {
    return this.leaveRequestsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-request.update')
  @ApiOperation({
    summary: 'Update a leave request',
    description:
      'Changing status to Approved deducts the computed working days from the balance; moving off Approved restores them.',
  })
  @ApiParam({
    name: 'id',
    description: 'Leave Request UUID',
    example: '8d2c0b32-fb0b-4b73-93a1-2b7a9f5e8d3d',
  })
  @ApiBody({
    type: UpdateLeaveRequestDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Leave request updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Leave request not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateLeaveRequestDto: UpdateLeaveRequestDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.leaveRequestsService.update(
      id,
      updateLeaveRequestDto,
      this.actorFrom(user, request),
    );
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-request.delete')
  @ApiOperation({
    summary: 'Delete a leave request',
  })
  @ApiParam({
    name: 'id',
    description: 'Leave Request UUID',
    example: '8d2c0b32-fb0b-4b73-93a1-2b7a9f5e8d3d',
  })
  @ApiResponse({
    status: 200,
    description: 'Leave request deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Leave request not found.',
  })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.leaveRequestsService.remove(id, this.actorFrom(user, request));
  }
}