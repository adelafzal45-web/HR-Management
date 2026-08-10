import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { LoansService } from './loans.service';

import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { SkipLoanInstallmentDto } from './dto/skip-loan-installment.dto';

@ApiTags('Loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create employee loan',
  })
  @ApiResponse({
    status: 201,
    description: 'Loan created successfully.',
  })
  async create(
    @Body() dto: CreateLoanDto,
    @Req() req: any,
  ) {
    return this.loansService.create(
      dto,
      req.user.user_id,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'Get loans',
  })
  @ApiQuery({
    name: 'user_id',
    required: false,
  })
  async findAll(
    @Query('user_id') userId?: string,
  ) {
    return this.loansService.findAll(
      userId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get loan by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Loan UUID.',
  })
  async findOne(
    @Param('id') id: string,
  ) {
    return this.loansService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update loan',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLoanDto,
  ) {
    return this.loansService.update(
      id,
      dto,
    );
  }

  @Post('installments/skip')
  @ApiOperation({
    summary: 'Skip loan installment',
  })
  async skipInstallment(
    @Body() dto: SkipLoanInstallmentDto,
    @Req() req: any,
  ) {
    return this.loansService.skipInstallment(
      dto,
      req.user.user_id,
    );
  }

  @Get('employee/:userId/pending-installment')
  @ApiOperation({
    summary:
      'Get employee pending loan installment',
  })
  async getPendingInstallment(
    @Param('userId') userId: string,
  ) {
    return this.loansService.getPendingInstallment(
      userId,
    );
  }
}