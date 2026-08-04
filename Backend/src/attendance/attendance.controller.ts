import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';

import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.create')
  @ApiOperation({
    summary: 'Create attendance record',
    description: 'Creates a new attendance record for an employee.',
  })
  @ApiBody({
    type: CreateAttendanceDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Attendance created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() createAttendanceDto: CreateAttendanceDto) {
    return this.attendanceService.create(createAttendanceDto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.view')
  @ApiOperation({
    summary: 'Get all attendance records',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all attendance records.',
  })
  findAll() {
    return this.attendanceService.findAll();
  }

  @Get('working-day-calendar')
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.view')
  @ApiOperation({
    summary: 'Working-day flags for a date range',
    description:
      'One entry per calendar day, so reports and calendars can mark non-working days and exclude them from absence calculations. Applies the designation -> department -> global fallback.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-08-31' })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'designation_id', required: false })
  @ApiResponse({ status: 200, description: 'Calendar returned.' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or reversed date range, or range longer than 366 days.',
  })
  getWorkingDayCalendar(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('department_id') departmentId?: string,
    @Query('designation_id') designationId?: string,
  ) {
    return this.attendanceService.getWorkingDayCalendar(
      from,
      to,
      departmentId,
      designationId,
    );
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.view')
  @ApiOperation({
    summary: 'Get attendance by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Attendance UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance record found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Attendance record not found.',
  })
  findOne(@Param('id') id: string) {
    return this.attendanceService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.update')
  @ApiOperation({
    summary: 'Update attendance record',
  })
  @ApiParam({
    name: 'id',
    description: 'Attendance UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiBody({
    type: UpdateAttendanceDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Attendance record not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateAttendanceDto: UpdateAttendanceDto,
  ) {
    return this.attendanceService.update(id, updateAttendanceDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.delete')
  @ApiOperation({
    summary: 'Delete attendance record',
  })
  @ApiParam({
    name: 'id',
    description: 'Attendance UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiResponse({
    status: 200,
    description: 'Attendance deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Attendance record not found.',
  })
  remove(@Param('id') id: string) {
    return this.attendanceService.remove(id);
  }
}
