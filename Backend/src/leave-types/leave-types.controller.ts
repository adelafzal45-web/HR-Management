import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { LeaveTypesService } from './leave-types.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
// import { Public } from 'src/auth/decorators/public.decorator';
@ApiTags('Leave Types')
@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  // ==========================================
  // CREATE
  // ==========================================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-types.create')
  // @Public()
  @ApiOperation({ summary: 'Create a leave type' })
  @ApiBody({ type: CreateLeaveTypeDto })
  @ApiResponse({ status: 201, description: 'Leave type created successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing leave-types.create permission.',
  })
  @ApiResponse({
    status: 409,
    description: 'A leave type with that name already exists.',
  })
  create(@Body() dto: CreateLeaveTypeDto) {
    return this.leaveTypesService.create(dto);
  }

  // ==========================================
  // LIST
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-types.view')
  // @Public()
  @ApiOperation({
    summary: 'List all leave types',
    description:
      'Returns every leave type, active and inactive, sorted by name.',
  })
  @ApiResponse({
    status: 200,
    description: 'Leave types retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing leave-types.view permission.',
  })
  findAll() {
    return this.leaveTypesService.findAll();
  }

  // ==========================================
  // READ ONE
  // ==========================================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-types.view')
  @ApiOperation({ summary: 'Get a leave type by id' })
  @ApiParam({ name: 'id', description: 'Leave type UUID' })
  @ApiResponse({
    status: 200,
    description: 'Leave type retrieved successfully.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing leave-types.view permission.',
  })
  @ApiResponse({ status: 404, description: 'Leave type not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveTypesService.findOne(id);
  }

  // ==========================================
  // UPDATE
  // ==========================================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-types.update')
  @ApiOperation({ summary: 'Update a leave type' })
  @ApiParam({ name: 'id', description: 'Leave type UUID' })
  @ApiBody({ type: UpdateLeaveTypeDto })
  @ApiResponse({ status: 200, description: 'Leave type updated successfully.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing leave-types.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Leave type not found.' })
  @ApiResponse({
    status: 409,
    description: 'A leave type with that name already exists.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveTypesService.update(id, dto);
  }

  // ==========================================
  // DELETE
  // ==========================================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('leave-types.delete')
  @ApiOperation({ summary: 'Delete a leave type' })
  @ApiParam({ name: 'id', description: 'Leave type UUID' })
  @ApiResponse({ status: 200, description: 'Leave type deleted successfully.' })
  @ApiResponse({
    status: 403,
    description: 'Missing leave-types.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Leave type not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.leaveTypesService.remove(id);
  }
}
