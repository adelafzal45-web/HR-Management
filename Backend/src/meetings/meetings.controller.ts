import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { MeetingsService } from './meetings.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { UpdateMeetingDto } from './dto/update-meeting.dto';
import { CancelMeetingDto } from './dto/cancel-meeting.dto';
import { MeetingStatus } from './meetings.entity';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';

@ApiTags('Meetings')
@ApiBearerAuth()
@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('meeting.create')
  @ApiOperation({
    summary: 'Schedule a meeting',
    description:
      'Creates a meeting and invites its participants. The invitee list is ' +
      'resolved from audience_type (specific people, a whole department, or ' +
      'everyone) and snapshotted, so later transfers do not change who was ' +
      'invited. Email and in-app notification are each sent only if the ' +
      'matching flag is set.',
  })
  @ApiBody({ type: CreateMeetingDto })
  @ApiResponse({ status: 201, description: 'Meeting scheduled.' })
  @ApiResponse({
    status: 400,
    description:
      'Invalid body, a date in the past, or an audience that resolves to nobody.',
  })
  create(@Body() dto: CreateMeetingDto, @CurrentUser() user: JwtUser) {
    return this.meetingsService.create(dto, user.user_id);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('meeting.view')
  @ApiOperation({ summary: 'List every meeting (paginated)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: MeetingStatus })
  @ApiQuery({ name: 'department_id', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO lower bound.' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO upper bound.' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiResponse({ status: 200, description: 'Returns `{ data, total }`.' })
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: MeetingStatus,
    @Query('department_id') departmentId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.meetingsService.findAll({
      search,
      status,
      departmentId,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  /**
   * Self-service. Deliberately guarded by authentication only: the Employee
   * role does not hold `meeting.view`, and scoping the query to the caller is
   * safer than widening that permission — the same reasoning behind
   * `/leave-requests/me`.
   */
  @Get('me')
  @ApiOperation({
    summary: "The caller's own meetings",
    description:
      'Meetings the authenticated user organizes or was invited to. No ' +
      'permission required — the result is scoped to the caller.',
  })
  @ApiResponse({ status: 200, description: 'Returns an array of meetings.' })
  findMine(@CurrentUser() user: JwtUser) {
    return this.meetingsService.findMine(user.user_id);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('meeting.view')
  @ApiOperation({ summary: 'Get one meeting, with its participants' })
  @ApiParam({ name: 'id', description: 'Meeting UUID.' })
  @ApiResponse({ status: 404, description: 'No meeting with that id.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.meetingsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('meeting.manage')
  @ApiOperation({
    summary: 'Update a meeting',
    description:
      'Participants are re-resolved only when the audience changes, and ' +
      'participants are re-notified only for changes they must act on (time, ' +
      'location, invitee list).',
  })
  @ApiParam({ name: 'id', description: 'Meeting UUID.' })
  @ApiBody({ type: UpdateMeetingDto })
  @ApiResponse({ status: 400, description: 'Past date, or already cancelled.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.meetingsService.update(id, dto);
  }

  @Patch(':id/cancel')
  @UseGuards(PermissionGuard)
  @RequirePermission('meeting.manage')
  @ApiOperation({
    summary: 'Cancel a meeting',
    description:
      'Requires a reason, which every participant sees in their notification ' +
      'and cancellation email.',
  })
  @ApiParam({ name: 'id', description: 'Meeting UUID.' })
  @ApiBody({ type: CancelMeetingDto })
  @ApiResponse({ status: 400, description: 'Already cancelled.' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelMeetingDto,
  ) {
    return this.meetingsService.cancel(id, dto.cancellation_reason);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('meeting.manage')
  @ApiOperation({
    summary: 'Delete a meeting',
    description:
      'Removes the record outright, for meetings created in error. To call off ' +
      'a real meeting use the cancel endpoint, which notifies participants.',
  })
  @ApiParam({ name: 'id', description: 'Meeting UUID.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.meetingsService.remove(id);
  }
}
