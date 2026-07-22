import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Post()
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

  @Get(':id')
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
