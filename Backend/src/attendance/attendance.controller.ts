import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
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

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ==========================================
  // SELF-SERVICE — the check-in / check-out buttons
  // ==========================================
  //
  // These four carry no @RequirePermission, deliberately. The global
  // JwtAuthGuard still applies, and every one of them is hard-scoped to
  // `user.user_id` off the verified token, so there is nothing here an employee
  // could reach that is not already their own. Gating them behind
  // `attendance.create` would lock out the Employee role — which holds no
  // attendance permissions at all — and punching your own clock is not an
  // administrative act.
  //
  // They are declared above `@Get(':id')` because Nest matches in declaration
  // order: registered after it, `me/today` would be read as an attendance id.

  @Get('me/today')
  @ApiOperation({
    summary: "Today's attendance for the signed-in employee",
    description:
      'Returns the current row (if any), whether today is a working day for ' +
      'this employee, and which of check-in / check-out is currently legal.',
  })
  @ApiResponse({
    status: 200,
    description: "Today's attendance status.",
  })
  getMyToday(@CurrentUser() user: JwtUser) {
    return this.attendanceService.getTodayForUser(user.user_id);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Own attendance history for one month',
    description:
      "The signed-in employee's own records only. Replaces fetching the whole " +
      'attendance table and filtering it in the browser.',
  })
  @ApiQuery({ name: 'month', required: true, example: 8 })
  @ApiQuery({ name: 'year', required: true, example: 2026 })
  @ApiResponse({
    status: 200,
    description: 'Attendance records for the requested month.',
  })
  getMyHistory(
    @CurrentUser() user: JwtUser,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    // Parsed here rather than by a DTO: `enableImplicitConversion` is off in
    // the global ValidationPipe, so query params arrive as strings regardless.
    return this.attendanceService.getMyHistory(
      user.user_id,
      Number(month),
      Number(year),
    );
  }

  @Post('check-in')
  @ApiOperation({
    summary: 'Check in',
    description:
      'Stamps the signed-in employee in at the server clock. Late vs Present ' +
      "is decided from the employee's own shift start time and grace period.",
  })
  @ApiResponse({ status: 201, description: 'Checked in.' })
  @ApiResponse({ status: 409, description: 'Already checked in today.' })
  checkIn(@CurrentUser() user: JwtUser) {
    return this.attendanceService.checkIn(user.user_id);
  }

  @Post('check-out')
  @ApiOperation({
    summary: 'Check out',
    description:
      'Stamps the signed-in employee out and derives working and overtime ' +
      'hours from the two stamps, less the shift break.',
  })
  @ApiResponse({ status: 201, description: 'Checked out.' })
  @ApiResponse({ status: 400, description: 'No check-in recorded today.' })
  @ApiResponse({ status: 409, description: 'Already checked out today.' })
  checkOut(@CurrentUser() user: JwtUser) {
    return this.attendanceService.checkOut(user.user_id);
  }

  // ==========================================
  // ADMIN / HR WRITES
  // ==========================================
  //
  // These stay as they were, `user_id` from the token and all. They are the
  // manual-correction path, not the button path — an employee clocking in goes
  // through /attendance/check-in above, which stamps its own time and status.

  @Post()
  @ApiOperation({
    summary: 'Create attendance record',
    description: 'Logged in employee marks attendance.',
  })
  @ApiBody({
    type: CreateAttendanceDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Attendance created successfully.',
  })
  create(@Req() req: any, @Body() createAttendanceDto: CreateAttendanceDto) {
    return this.attendanceService.create(createAttendanceDto, req.user.user_id);
  }

  // ==========================================
  // ORG-WIDE READS
  // ==========================================
  //
  // Both are guarded: they return every employee's attendance, which is what
  // the HR Attendance Records screen needs and what nobody else should see.
  // `working-day-calendar` is a literal segment, so like the `me/*` routes it
  // has to be declared before `:id` or it is parsed as an attendance id.

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('attendance.view')
  @ApiOperation({
    summary: 'List all attendance records',
    description: 'Org-wide. Employees should use /attendance/me instead.',
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
      'One entry per calendar day so reports can shade non-working days ' +
      'without reimplementing the designation → department → global ladder.',
  })
  @ApiQuery({ name: 'from', required: true, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: true, example: '2026-08-31' })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'designationId', required: false })
  getWorkingDayCalendar(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('departmentId') departmentId?: string,
    @Query('designationId') designationId?: string,
  ) {
    return this.attendanceService.getWorkingDayCalendar(
      from,
      to,
      departmentId ?? null,
      designationId ?? null,
    );
  }

  @Get(':id')
  /* @UseGuards(PermissionGuard)
  @RequirePermission('attendance.view')*/
  @ApiParam({
    name: 'id',
  })
  findOne(@Param('id') id: string) {
    return this.attendanceService.findOne(id);
  }

  @Patch()
  @ApiOperation({
    summary: 'update attendance record',
    description: 'Logged in employee marks attendance.',
  })
  /*@UseGuards(PermissionGuard)
  @RequirePermission('attendance.update')*/
  update(@Req() req: any, @Body() updateAttendanceDto: UpdateAttendanceDto) {
    return this.attendanceService.update(req.user.user_id, updateAttendanceDto);
  }

  @Delete(':id')
  /* @UseGuards(PermissionGuard)
  @RequirePermission('attendance.delete')*/
  remove(@Param('id') id: string) {
    return this.attendanceService.remove(id);
  }
}