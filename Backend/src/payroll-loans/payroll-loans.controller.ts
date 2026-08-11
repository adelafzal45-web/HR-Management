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

import { PayrollLoansService } from './payroll-loans.service';
import { CreateEmployeeLoanDto } from './dto/create-employee-loan.dto';
import { UpdateEmployeeLoanDto } from './dto/update-employee-loan.dto';
import { CreateLoanRequestDto } from './dto/create-loan-request.dto';
import {
  ApproveLoanRequestDto,
  RejectLoanRequestDto,
} from './dto/decide-loan-request.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';

@ApiTags('Payroll Loans')
@ApiBearerAuth()
@Controller('payroll-loans')
export class PayrollLoansController {
  constructor(private readonly payrollLoansService: PayrollLoansService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.create')
  @ApiOperation({ summary: 'Create an employee loan or salary advance' })
  @ApiBody({ type: CreateEmployeeLoanDto })
  @ApiResponse({ status: 201, description: 'Loan created.' })
  @ApiResponse({ status: 400, description: 'Invalid installment amount.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.create permission.',
  })
  create(@Body() dto: CreateEmployeeLoanDto) {
    return this.payrollLoansService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.view')
  @ApiOperation({ summary: 'List loans (filterable by employee and status)' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by employee.' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'active | closed | paused',
  })
  @ApiResponse({ status: 200, description: 'Loans retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.view permission.',
  })
  findAll(@Query('userId') userId?: string, @Query('status') status?: string) {
    return this.payrollLoansService.findAll(userId, status);
  }

  // ==========================================
  // SELF-SERVICE — the employee's own My Loans / Apply for Loan screen
  // ==========================================
  //
  // These three carry no @RequirePermission, deliberately, following the same
  // pattern as /leave-requests/me and /payslips/me. The global JwtAuthGuard
  // still applies, and each is hard-scoped to `user.user_id` off the verified
  // token, so there is nothing here an employee could reach that is not
  // already their own.
  //
  // Gating them behind payroll-loans.view / .create would not work: those
  // permissions are org-wide (findAll returns every employee's loans, and the
  // create body carries an arbitrary user_id), so granting them to the Employee
  // role would leak the whole company's borrowing and let anyone file a loan
  // against a colleague's payroll.
  //
  // Route order matters: these static `me` segments must be declared before
  // `:id`, or the parametric route would swallow them.

  @Get('me')
  @ApiOperation({
    summary: 'Own loans and requests',
    description:
      "The signed-in employee's own loans only, each with its installment " +
      'schedule and the decision note if HR has already decided.',
  })
  @ApiResponse({ status: 200, description: "Returns the caller's loans." })
  findMine(@CurrentUser() user: JwtUser) {
    return this.payrollLoansService.findMine(user.user_id);
  }

  @Post('me')
  @ApiOperation({
    summary: 'Request a loan or salary advance',
    description:
      'Files a request for the signed-in employee. user_id is taken from the ' +
      'token (not the body) and the status is forced to pending, so nothing ' +
      'is deducted until HR approves.',
  })
  @ApiBody({ type: CreateLoanRequestDto })
  @ApiResponse({ status: 201, description: 'Request submitted.' })
  @ApiResponse({ status: 400, description: 'Invalid amount.' })
  createMine(
    @Body() dto: CreateLoanRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollLoansService.createMine(user.user_id, dto);
  }

  @Delete('me/:id')
  @ApiOperation({
    summary: 'Withdraw own pending request',
    description:
      'Only while still pending — an approved loan is a live payroll ' +
      'obligation and only HR can change it.',
  })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiResponse({ status: 200, description: 'Request withdrawn.' })
  @ApiResponse({ status: 400, description: 'Request is no longer pending.' })
  @ApiResponse({ status: 404, description: 'Not found, or not the caller’s.' })
  removeMine(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollLoansService.removeMine(user.user_id, id);
  }

  // ==========================================
  // APPROVAL — HR/Admin decide on employee requests
  // ==========================================

  @Post(':id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.approve')
  @ApiOperation({
    summary: 'Approve a pending loan request',
    description:
      'Activates the loan with the installment HR decided on and generates ' +
      'its repayment schedule. Only a pending request can be approved.',
  })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiBody({ type: ApproveLoanRequestDto, required: false })
  @ApiResponse({ status: 201, description: 'Request approved and scheduled.' })
  @ApiResponse({ status: 400, description: 'Not pending, or invalid installment.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.approve permission.',
  })
  @ApiResponse({ status: 404, description: 'Loan not found.' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLoanRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollLoansService.approveRequest(id, user.user_id, dto ?? {});
  }

  @Post(':id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.approve')
  @ApiOperation({ summary: 'Reject a pending loan request' })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiBody({ type: RejectLoanRequestDto, required: false })
  @ApiResponse({ status: 201, description: 'Request rejected.' })
  @ApiResponse({ status: 400, description: 'Request is not pending.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.approve permission.',
  })
  @ApiResponse({ status: 404, description: 'Loan not found.' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectLoanRequestDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.payrollLoansService.rejectRequest(id, user.user_id, dto?.note);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.view')
  @ApiOperation({ summary: 'Get a loan with its installment schedule' })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiResponse({ status: 200, description: 'Loan retrieved.' })
  @ApiResponse({ status: 404, description: 'Loan not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollLoansService.findOne(id);
  }

  /**
   * Generate the installment schedule from principal / installment amount.
   * Preserves installments already deducted by a payroll run.
   */
  @Post(':id/schedule')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.update')
  @ApiOperation({ summary: 'Generate the loan installment schedule' })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiResponse({ status: 201, description: 'Schedule generated.' })
  @ApiResponse({ status: 400, description: 'Installment amount not set.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Loan not found.' })
  schedule(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollLoansService.schedule(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.update')
  @ApiOperation({ summary: 'Update a loan' })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiBody({ type: UpdateEmployeeLoanDto })
  @ApiResponse({ status: 200, description: 'Loan updated.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Loan not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeLoanDto,
  ) {
    return this.payrollLoansService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-loans.delete')
  @ApiOperation({ summary: 'Delete a loan and its installments' })
  @ApiParam({ name: 'id', description: 'Loan UUID' })
  @ApiResponse({ status: 200, description: 'Loan deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-loans.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Loan not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollLoansService.remove(id);
  }
}
