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
  Req,
  UploadedFile as UploadedFileParam,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { UserService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { EmployeeQueryDto } from './dto/employee-query.dto';
import { UpdateAccountSettingsDto } from './dto/update-account-settings.dto';
import { AssignLeaveTypesDto } from './dto/assign-leave-types.dto';
import {
  ChangeOwnPasswordDto,
  ResetPasswordDto,
} from './dto/reset-password.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import type { AuditActor } from '../audit/audit.service';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_PHOTO_BYTES,
  type UploadedFile,
} from '../common/upload/image-upload';

/**
 * Employee endpoints.
 *
 * Identity comes from the verified JWT via `@CurrentUser()`; the old
 * `x-user-id` header is gone, since a client-supplied user id let any caller
 * act as any user. Route-level `@RequirePermission` is the backend half of the
 * RBAC story — the frontend's `<Can>` gating is a convenience, not a control.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  /** Builds the audit actor from the token plus request metadata. */
  private actorFrom(user: JwtUser, request: Request): AuditActor {
    return {
      user_id: user.user_id,
      email: user.email,
      ip: request.ip,
      userAgent: request.get('user-agent') ?? undefined,
    };
  }

  // ==========================================
  // ROLE ASSIGNMENT OPTIONS
  // ==========================================

  /**
   * Declared before `GET :id` because Nest matches routes in declaration
   * order — otherwise `/users/assignable-roles` would bind to the `:id` param
   * and fail UUID validation.
   */
  @Get('assignable-roles')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.role.assign')
  @ApiOperation({
    summary: 'Roles the current user may assign',
    description:
      "Returns only roles whose permission set is a subset of the caller's own, so a user cannot create an account more privileged than themselves.",
  })
  @ApiResponse({ status: 200, description: 'Assignable roles.' })
  async assignableRoles(@CurrentUser() user: JwtUser) {
    const permissions = await this.authorizationService.getPermissionsForUser(
      user.user_id,
    );
    return this.userService.getAssignableRoles(permissions);
  }

  // ==========================================
  // TEAM LEADS
  // ==========================================

  @Get('team-leads')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Team Leads, optionally scoped to one department',
    description:
      'Powers the evaluator (Team Lead) dropdown on the employee form. Returns active Team Leads across all departments; pass department_id only to narrow the list.',
  })
  @ApiQuery({ name: 'department_id', required: false, format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Matching Team Leads.' })
  findTeamLeads(@Query('department_id') departmentId?: string) {
    return this.userService.findTeamLeads(departmentId);
  }

  // ==========================================
  // SELF-SERVICE PROFILE
  // ==========================================

  @Get('me/profile')
  @ApiOperation({
    summary: "The signed-in employee's own profile",
    description:
      'No permission required beyond authentication — every employee may read their own record. Backs the /profile route.',
  })
  @ApiResponse({ status: 200, description: "The caller's profile." })
  findOwnProfile(@CurrentUser() user: JwtUser) {
    return this.userService.findOne(user.user_id);
  }

  @Get('me/leave-balances')
  @ApiOperation({ summary: "The signed-in employee's leave balances" })
  @ApiResponse({
    status: 200,
    description: 'Allocated, used and remaining days.',
  })
  findOwnLeaveBalances(@CurrentUser() user: JwtUser) {
    return this.userService.findLeaveBalances(user.user_id);
  }

  @Get('me/team')
  @ApiOperation({
    summary: "The signed-in Team Lead's direct reports",
    description:
      'Backs the "My Team" section. Returns an empty page for a user who leads nobody.',
  })
  @ApiResponse({ status: 200, description: 'Paginated team members.' })
  findOwnTeam(@CurrentUser() user: JwtUser, @Query() query: EmployeeQueryDto) {
    return this.userService.findTeamMembers(user.user_id, query);
  }

  @Patch('me/profile')
  @ApiOperation({
    summary: "Update the signed-in employee's own profile",
    description:
      'Accepts only photo, phone, address, emergency contact and (policy permitting) personal email. Any other field in the body is discarded — HR-controlled data cannot be self-edited. Backs /profile/edit.',
  })
  @ApiBody({ type: UpdateOwnProfileDto })
  @ApiResponse({ status: 200, description: 'Profile updated.' })
  @ApiResponse({
    status: 403,
    description: 'Email changes are not permitted by policy.',
  })
  async updateOwnProfile(
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateOwnProfileDto,
    @Req() request: Request,
  ) {
    // Self-service email changes are gated on a permission rather than a
    // hardcoded policy flag, so HR can decide per role without a code change.
    const allowEmailChange = await this.authorizationService.hasPermission(
      user.user_id,
      'employees.profile.email.edit',
    );

    return this.userService.updateOwnProfile(
      user.user_id,
      dto,
      { allowEmailChange },
      this.actorFrom(user, request),
    );
  }

  @Post('me/change-password')
  @ApiOperation({
    summary: "Change the signed-in employee's own password",
    description:
      'Requires the current password. Rejected when password changes are disabled on the account.',
  })
  @ApiBody({ type: ChangeOwnPasswordDto })
  @ApiResponse({ status: 201, description: 'Password changed.' })
  @ApiResponse({ status: 400, description: 'Current password is incorrect.' })
  changeOwnPassword(
    @CurrentUser() user: JwtUser,
    @Body() dto: ChangeOwnPasswordDto,
    @Req() request: Request,
  ) {
    return this.userService.changeOwnPassword(
      user.user_id,
      dto,
      this.actorFrom(user, request),
    );
  }

  @Post('me/photo')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: "Upload the signed-in employee's own photo",
    description: `Accepts ${ALLOWED_IMAGE_MIME_TYPES.join(', ')} up to ${MAX_PHOTO_BYTES / (1024 * 1024)} MB. Contents are checked against the declared type.`,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Photo uploaded.' })
  @ApiResponse({ status: 400, description: 'Invalid or oversized image.' })
  uploadOwnPhoto(
    @CurrentUser() user: JwtUser,
    @UploadedFileParam() file: UploadedFile | undefined,
    @Req() request: Request,
  ) {
    return this.userService.updatePhoto(
      user.user_id,
      file,
      this.actorFrom(user, request),
    );
  }

  @Delete('me/photo')
  @ApiOperation({ summary: "Remove the signed-in employee's own photo" })
  @ApiResponse({ status: 200, description: 'Photo removed.' })
  removeOwnPhoto(@CurrentUser() user: JwtUser, @Req() request: Request) {
    return this.userService.removePhoto(
      user.user_id,
      this.actorFrom(user, request),
    );
  }

  // ==========================================
  // CREATE
  // ==========================================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.create')
  @ApiOperation({
    summary: 'Create an employee',
    description:
      'Generates the next TC-EMP-NNN code, hashes the password, validates the Team Lead against the chosen department and writes leave balances — all in one transaction.',
  })
  @ApiBody({ type: CreateUserDto })
  @ApiResponse({ status: 201, description: 'Employee created.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 401, description: 'Not authenticated.' })
  @ApiResponse({
    status: 403,
    description:
      'Missing employees.create, or the role is not assignable by the caller.',
  })
  @ApiResponse({
    status: 409,
    description: 'Email or employee code already in use.',
  })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    // Checked here rather than in the service so the same rule applies whether
    // the role arrives on create or on update.
    const permissions = await this.authorizationService.getPermissionsForUser(
      user.user_id,
    );
    await this.userService.assertRoleAssignable(
      createUserDto.role_id,
      permissions,
    );

    return this.userService.create(
      createUserDto,
      this.actorFrom(user, request),
    );
  }

  // ==========================================
  // LIST
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'List employees',
    description:
      'Server-side pagination, search across code/name/email/phone, and filters for department, designation, role, shift, job category, team lead, employment type and status. Pass team_leads_only=true for the Team Leads tab.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Paginated employees in the standard { data, total, page, limit, totalPages } envelope.',
  })
  findAll(@Query() query: EmployeeQueryDto) {
    return this.userService.findAll(query);
  }

  // ==========================================
  // READ ONE
  // ==========================================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({ summary: 'Get an employee by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Employee found.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findOne(id);
  }

  @Get(':id/team')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.team.view')
  @ApiOperation({
    summary: "A Team Lead's direct reports",
    description:
      'Paginated and searchable. Backs the expandable member list on the Team Leads tab.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Paginated team members.' })
  @ApiResponse({ status: 404, description: 'Team Lead not found.' })
  findTeam(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: EmployeeQueryDto,
  ) {
    return this.userService.findTeamMembers(id, query);
  }

  @Get(':id/leave-balances')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({ summary: "An employee's leave balances" })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Allocated, used and remaining days.',
  })
  findLeaveBalances(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.findLeaveBalances(id);
  }

  // ==========================================
  // UPDATE
  // ==========================================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.update')
  @ApiOperation({
    summary: 'Update an employee',
    description:
      'Full HR edit. Password is excluded — use POST :id/reset-password so credential changes are separately permissioned and audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResponse({ status: 200, description: 'Employee updated.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  @ApiResponse({
    status: 409,
    description: 'Email or employee code already in use.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    if (updateUserDto.role_id) {
      const permissions = await this.authorizationService.getPermissionsForUser(
        user.user_id,
      );
      await this.userService.assertRoleAssignable(
        updateUserDto.role_id,
        permissions,
      );
    }

    return this.userService.update(
      id,
      updateUserDto,
      this.actorFrom(user, request),
    );
  }

  @Patch(':id/account-settings')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.login.manage')
  @ApiOperation({
    summary: 'Update account state toggles',
    description:
      "Login enabled, password-reset allowed, web/mobile/API/multi-device access, remote and biometric attendance, overtime, and employment status. Feature-module access is governed by the employee's role, not here.",
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: UpdateAccountSettingsDto })
  @ApiResponse({ status: 200, description: 'Account settings updated.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  updateAccountSettings(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountSettingsDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.userService.updateAccountSettings(
      id,
      dto,
      this.actorFrom(user, request),
    );
  }

  @Patch(':id/leave-types')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.leave.assign')
  @ApiOperation({
    summary: "Set an employee's allowed leave types and balances",
    description:
      'Replaces the whole set: types omitted from the payload are removed. Allocations for types already assigned are updated in place, so consumed days are preserved.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: AssignLeaveTypesDto })
  @ApiResponse({ status: 200, description: 'Leave types assigned.' })
  @ApiResponse({
    status: 400,
    description: 'Unknown leave type, or used days exceed the allocation.',
  })
  assignLeaveTypes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignLeaveTypesDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.userService.assignLeaveTypes(
      id,
      dto,
      this.actorFrom(user, request),
    );
  }

  @Post(':id/reset-password')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.password.reset')
  @ApiOperation({
    summary: "Reset an employee's password",
    description:
      'Administrative reset — no current password required. Refused when the account has password resets disabled. The new password is hashed; only the fact of the reset is audited.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 201, description: 'Password reset.' })
  @ApiResponse({
    status: 403,
    description: 'Password resets are disabled for this account.',
  })
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.userService.resetPassword(
      id,
      dto,
      this.actorFrom(user, request),
    );
  }

  @Post(':id/photo')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.update')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload an employee photo',
    description: `Accepts ${ALLOWED_IMAGE_MIME_TYPES.join(', ')} up to ${MAX_PHOTO_BYTES / (1024 * 1024)} MB. The file's bytes are verified against its declared type, and it is stored under a generated name.`,
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 201, description: 'Photo uploaded.' })
  @ApiResponse({ status: 400, description: 'Invalid or oversized image.' })
  uploadPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFileParam() file: UploadedFile | undefined,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.userService.updatePhoto(
      id,
      file,
      this.actorFrom(user, request),
    );
  }

  @Delete(':id/photo')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.update')
  @ApiOperation({ summary: 'Remove an employee photo' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Photo removed.' })
  removePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.userService.removePhoto(id, this.actorFrom(user, request));
  }

  // ==========================================
  // DELETE
  // ==========================================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.delete')
  @ApiOperation({
    summary: 'Delete an employee',
    description:
      'Direct reports are detached first, and the full record is captured in the audit trail before removal.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Employee deleted.' })
  @ApiResponse({ status: 404, description: 'Employee not found.' })
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
    @Req() request: Request,
  ) {
    return this.userService.delete(id, this.actorFrom(user, request));
  }
}
