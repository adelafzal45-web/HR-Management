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
} from '@nestjs/swagger';

import { PayrollLoansService } from './payroll-loans.service';
import { CreateEmployeeLoanDto } from './dto/create-employee-loan.dto';
import { UpdateEmployeeLoanDto } from './dto/update-employee-loan.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Payroll Loans')
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
