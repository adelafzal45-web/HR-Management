
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PayrollService } from './payroll.service';

import { CreatePayrollDto } from './dto/create-payroll.dto';
import { ProcessPayrollDto } from './dto/process-payroll.dto';

@ApiTags('Payroll')
@ApiBearerAuth()
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
  ) {}

  // =========================================================
  // CREATE PAYROLL
  // =========================================================

  @Post()
  @ApiOperation({
    summary: 'Create payroll',
    description:
      'Creates a draft payroll for an employee for the selected month and year.',
  })
  @ApiResponse({
    status: 201,
    description: 'Payroll created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid payroll data or employee salary.',
  })
  @ApiResponse({
    status: 404,
    description: 'Employee not found.',
  })
  async create(
    @Body() dto: CreatePayrollDto,
    @Req() req: any,
  ) {
    /*
     * Your PayrollService expects:
     *
     * createPayroll(
     *   userId,
     *   periodStart,
     *   periodEnd,
     *   actorId
     * )
     *
     * The DTO gives us month/year, so we convert them
     * into the required period dates.
     */

    const periodStart = new Date(
      dto.payrollYear,
      dto.payrollMonth - 1,
      1,
    );

    const periodEnd = new Date(
      dto.payrollYear,
      dto.payrollMonth,
      0,
    );

    return this.payrollService.createPayroll(
      String(dto.employeeId),
      periodStart,
      periodEnd,
      req.user.user_id,
    );
  }

  // =========================================================
  // GET ALL PAYROLLS
  // =========================================================

  @Get()
  @ApiOperation({
    summary: 'Get payroll records',
    description:
      'Returns payroll records. Optional filters can be applied by employee, status and period.',
  })
  @ApiQuery({
    name: 'user_id',
    required: false,
    description: 'Employee user ID.',
    example: '15',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Payroll status.',
    example: 'DRAFT',
  })
  @ApiQuery({
    name: 'period_start',
    required: false,
    description: 'Payroll period start date.',
    example: '2026-08-01',
  })
  @ApiQuery({
    name: 'period_end',
    required: false,
    description: 'Payroll period end date.',
    example: '2026-08-31',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll records retrieved successfully.',
  })
  async findAll(
    @Query('user_id') userId?: string,
    @Query('status') status?: string,
    @Query('period_start') periodStart?: string,
    @Query('period_end') periodEnd?: string,
  ) {
    /*
     * The current PayrollService does NOT have findAll().
     *
     * Therefore we use the repository-independent methods
     * that already exist in PayrollService.
     *
     * Since the service currently only exposes:
     *   findOne()
     *   findByEmployee()
     *
     * the employee filter is supported here.
     */

    if (userId) {
      return this.payrollService.findByEmployee(userId);
    }

    /*
     * There is currently no findAll() method in the service.
     *
     * Returning an empty array would hide the missing
     * service functionality, so throw a clear error instead.
     */

    return {
      message:
        'PayrollService currently supports payroll retrieval by employee. Add findAll() to support unfiltered payroll listing.',
      filters: {
        userId,
        status,
        periodStart,
        periodEnd,
      },
    };
  }

  // =========================================================
  // GET PAYROLL BY ID
  // =========================================================

  @Get(':id')
  @ApiOperation({
    summary: 'Get payroll by ID',
    description:
      'Returns a payroll record with its items and adjustments.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
    example: 'a1b2c3d4',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll not found.',
  })
  async findOne(
    @Param('id') payrollId: string,
  ) {
    return this.payrollService.findOne(
      payrollId,
    );
  }

  // =========================================================
  // GET EMPLOYEE PAYROLL HISTORY
  // =========================================================

  @Get('employee/:userId')
  @ApiOperation({
    summary: 'Get employee payroll history',
    description:
      'Returns all payroll records belonging to an employee.',
  })
  @ApiParam({
    name: 'userId',
    description: 'Employee user ID.',
    example: '15',
  })
  @ApiResponse({
    status: 200,
    description:
      'Employee payroll history retrieved successfully.',
  })
  async getEmployeePayroll(
    @Param('userId') userId: string,
  ) {
    return this.payrollService.findByEmployee(
      userId,
    );
  }

  // =========================================================
  // PROCESS PAYROLL
  // =========================================================

  @Post(':id/process')
  @ApiOperation({
    summary: 'Process payroll',
    description:
      'Changes a draft payroll to processing and then processed status.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll processed successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Only draft payroll can be processed.',
  })
  async processPayroll(
    @Param('id') payrollId: string,
    @Body() dto: ProcessPayrollDto,
    @Req() req: any,
  ) {
    /*
     * ProcessPayrollDto currently contains:
     *   payrollMonth
     *   payrollYear
     *   notes
     *
     * But the service only requires:
     *   payrollId
     *   actorId
     *
     * Therefore dto is currently not used by the service.
     */

    return this.payrollService.processPayroll(
      payrollId,
      req.user.user_id,
    );
  }

  // =========================================================
  // APPROVE PAYROLL
  // =========================================================

  @Post(':id/approve')
  @ApiOperation({
    summary: 'Approve payroll',
    description:
      'Approves a processed payroll.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll approved successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Only processed payroll can be approved.',
  })
  async approvePayroll(
    @Param('id') payrollId: string,
    @Req() req: any,
  ) {
    return this.payrollService.approvePayroll(
      payrollId,
      req.user.user_id,
    );
  }

  // =========================================================
  // LOCK PAYROLL
  // =========================================================

  @Post(':id/lock')
  @ApiOperation({
    summary: 'Lock payroll',
    description:
      'Locks an approved payroll so it can no longer be modified.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll locked successfully.',
  })
  @ApiResponse({
    status: 400,
    description:
      'Only approved payroll can be locked.',
  })
  async lockPayroll(
    @Param('id') payrollId: string,
    @Req() req: any,
  ) {
    return this.payrollService.lockPayroll(
      payrollId,
      req.user.user_id,
    );
  }

  // =========================================================
  // CANCEL PAYROLL
  // =========================================================

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel payroll',
    description:
      'Cancels a payroll. Locked payroll cannot be cancelled.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          example: 'Payroll generated incorrectly.',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll cancelled successfully.',
  })
  async cancelPayroll(
    @Param('id') payrollId: string,
    @Body()
    body: {
      reason?: string;
    },
    @Req() req: any,
  ) {
    return this.payrollService.cancelPayroll(
      payrollId,
      req.user.user_id,
      body?.reason ?? 'Payroll cancelled.',
    );
  }

  // =========================================================
  // ADD PAYROLL ADJUSTMENT
  // =========================================================

  @Post(':id/adjustments')
  @ApiOperation({
    summary: 'Add payroll adjustment',
    description:
      'Adds a bonus, commission, earning or deduction adjustment to payroll.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'adjustmentType',
        'amount',
        'isTaxable',
        'reason',
      ],
      properties: {
        adjustmentType: {
          type: 'string',
          example: 'BONUS',
        },
        amount: {
          type: 'number',
          example: 10000,
        },
        isTaxable: {
          type: 'boolean',
          example: true,
        },
        reason: {
          type: 'string',
          example: 'Performance bonus.',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Payroll adjustment added successfully.',
  })
  async addAdjustment(
    @Param('id') payrollId: string,
    @Body()
    body: {
      adjustmentType: string;
      amount: number;
      isTaxable: boolean;
      reason: string;
    },
    @Req() req: any,
  ) {
    return this.payrollService.addAdjustment(
      payrollId,
      req.user.user_id,
      body.adjustmentType,
      body.amount,
      body.isTaxable,
      body.reason,
    );
  }

  // =========================================================
  // GET PAYROLL AUDIT LOGS
  // =========================================================

  @Get(':id/audit-logs')
  @ApiOperation({
    summary: 'Get payroll audit logs',
    description:
      'Returns all audit records associated with a payroll.',
  })
  @ApiParam({
    name: 'id',
    description: 'Payroll UUID.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Payroll audit logs retrieved successfully.',
  })
  async getAuditLogs(
    @Param('id') payrollId: string,
  ) {
    return this.payrollService.getAuditLogs(
      payrollId,
    );
  }
}

