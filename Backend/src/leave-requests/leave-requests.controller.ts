import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Leave Requests')
@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private readonly leaveRequestsService: LeaveRequestsService) {}

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
  create(@Body() createLeaveRequestDto: CreateLeaveRequestDto) {
    return this.leaveRequestsService.create(createLeaveRequestDto);
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
  ) {
    return this.leaveRequestsService.update(id, updateLeaveRequestDto);
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
  remove(@Param('id') id: string) {
    return this.leaveRequestsService.remove(id);
  }
}
