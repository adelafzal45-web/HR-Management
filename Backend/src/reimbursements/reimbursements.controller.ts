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
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { ReimbursementsService } from './reimbursements.service';
import {
  CreateClaimForEmployeeDto,
  CreateReimbursementDto,
  DecideReimbursementDto,
  ReimbursementFiltersDto,
  UpdateReimbursementDto,
} from './dto/reimbursement.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';

@ApiTags('Reimbursements')
@ApiBearerAuth()
@Controller('reimbursements')
export class ReimbursementsController {
  constructor(private readonly reimbursementsService: ReimbursementsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.create')
  @ApiOperation({
    summary: 'File an expense claim on an employee’s behalf',
    description:
      'For HR entering a paper claim. The employee is named in the body; the ' +
      'claim still starts pending and needs approving like any other.',
  })
  @ApiBody({ type: CreateClaimForEmployeeDto })
  @ApiResponse({ status: 201, description: 'Claim filed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing reimbursements.create permission.',
  })
  create(@Body() dto: CreateClaimForEmployeeDto) {
    return this.reimbursementsService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.view')
  @ApiOperation({ summary: 'List claims across the organisation' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by employee.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'pending | approved | rejected | paid',
  })
  @ApiQuery({ name: 'from', required: false, description: 'Expenses on/after (ISO).' })
  @ApiQuery({ name: 'to', required: false, description: 'Expenses on/before (ISO).' })
  @ApiResponse({ status: 200, description: 'Claims retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing reimbursements.view permission.',
  })
  findAll(@Query() filters: ReimbursementFiltersDto) {
    return this.reimbursementsService.findAll(filters);
  }

  // ==========================================
  // SELF-SERVICE — the employee's own My Claims screen
  // ==========================================
  //
  // These three carry no @RequirePermission, deliberately, following the same
  // pattern as /leave-requests/me, /payslips/me and /payroll-loans/me. The
  // global JwtAuthGuard still applies, and each is hard-scoped to `user.user_id`
  // off the verified token, so there is nothing reachable here that is not
  // already the caller's own.
  //
  // Gating them behind reimbursements.view / .create would not work: those
  // permissions are org-wide (findAll returns every employee's claims, and the
  // create body carries an arbitrary user_id), so granting them to the Employee
  // role would expose the whole company's expenses and let anyone file a claim
  // in a colleague's name.
  //
  // Route order matters: these static `me` segments must be declared before
  // `:id`, or the parametric route would swallow them.

  @Get('me')
  @ApiOperation({
    summary: 'Own expense claims',
    description:
      "The signed-in employee's own claims, newest expense first, each with " +
      'its status and the decision note if HR has already decided.',
  })
  @ApiResponse({ status: 200, description: "Returns the caller's claims." })
  findMine(@CurrentUser() user: JwtUser) {
    return this.reimbursementsService.findMine(user.user_id);
  }

  @Post('me')
  @ApiOperation({
    summary: 'Submit an expense claim',
    description:
      'Files a claim for the signed-in employee. user_id is taken from the ' +
      'token (not the body) and the status is forced to pending, so nothing ' +
      'reaches a payslip until HR approves.',
  })
  @ApiBody({ type: CreateReimbursementDto })
  @ApiResponse({ status: 201, description: 'Claim submitted.' })
  @ApiResponse({ status: 400, description: 'Invalid amount.' })
  createMine(
    @Body() dto: CreateReimbursementDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reimbursementsService.createMine(user.user_id, dto);
  }

  @Delete('me/:id')
  @ApiOperation({
    summary: 'Withdraw own pending claim',
    description:
      'Only while still pending — once HR has decided, only HR can change it.',
  })
  @ApiParam({ name: 'id', description: 'Reimbursement UUID' })
  @ApiResponse({ status: 200, description: 'Claim withdrawn.' })
  @ApiResponse({ status: 400, description: 'Claim is no longer pending.' })
  @ApiResponse({ status: 404, description: 'Not found, or not the caller’s.' })
  removeMine(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reimbursementsService.removeMine(user.user_id, id);
  }

  // ==========================================
  // APPROVAL — HR/Admin decide on employee claims
  // ==========================================

  @Post(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.approve')
  @ApiOperation({
    summary: 'Approve a pending claim',
    description:
      'Approval does not pay anything by itself: the next payroll run covering ' +
      'the expense date adds it to the payslip as a non-taxable earning and ' +
      'marks the claim paid.',
  })
  @ApiParam({ name: 'id', description: 'Reimbursement UUID' })
  @ApiBody({ type: DecideReimbursementDto, required: false })
  @ApiResponse({ status: 201, description: 'Claim approved.' })
  @ApiResponse({ status: 400, description: 'Claim is not pending.' })
  @ApiResponse({
    status: 403,
    description: 'Missing reimbursements.approve permission.',
  })
  @ApiResponse({ status: 404, description: 'Claim not found.' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideReimbursementDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reimbursementsService.approve(id, user.user_id, dto?.note);
  }

  @Post(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.approve')
  @ApiOperation({ summary: 'Reject a pending claim' })
  @ApiParam({ name: 'id', description: 'Reimbursement UUID' })
  @ApiBody({ type: DecideReimbursementDto, required: false })
  @ApiResponse({ status: 201, description: 'Claim rejected.' })
  @ApiResponse({ status: 400, description: 'Claim is not pending.' })
  @ApiResponse({
    status: 403,
    description: 'Missing reimbursements.approve permission.',
  })
  @ApiResponse({ status: 404, description: 'Claim not found.' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideReimbursementDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reimbursementsService.reject(id, user.user_id, dto?.note);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.view')
  @ApiOperation({ summary: 'Get a claim' })
  @ApiParam({ name: 'id', description: 'Reimbursement UUID' })
  @ApiResponse({ status: 200, description: 'Claim retrieved.' })
  @ApiResponse({ status: 404, description: 'Claim not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reimbursementsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.update')
  @ApiOperation({
    summary: 'Edit a pending claim',
    description:
      'Blocked once decided — changing an approved amount would silently ' +
      'change what payroll pays out.',
  })
  @ApiParam({ name: 'id', description: 'Reimbursement UUID' })
  @ApiBody({ type: UpdateReimbursementDto })
  @ApiResponse({ status: 200, description: 'Claim updated.' })
  @ApiResponse({ status: 400, description: 'Claim is no longer pending.' })
  @ApiResponse({
    status: 403,
    description: 'Missing reimbursements.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Claim not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReimbursementDto,
  ) {
    return this.reimbursementsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('reimbursements.delete')
  @ApiOperation({ summary: 'Delete a claim (paid claims cannot be deleted)' })
  @ApiParam({ name: 'id', description: 'Reimbursement UUID' })
  @ApiResponse({ status: 200, description: 'Claim deleted.' })
  @ApiResponse({ status: 400, description: 'Claim has already been paid.' })
  @ApiResponse({
    status: 403,
    description: 'Missing reimbursements.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Claim not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.reimbursementsService.remove(id);
  }
}
