import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PayrollService } from './payroll.service';
import { CreatePayrollDto } from './dto/create-payroll.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Payroll')
@ApiBearerAuth('JWT')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.create')
  @ApiOperation({
    summary: 'Create payroll',
    description: 'Creates a payroll record for an employee.',
  })
  @ApiBody({
    type: CreatePayrollDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Payroll created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  create(@Body() dto: CreatePayrollDto) {
    return this.payrollService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.view')
  @ApiOperation({
    summary: 'Get all payroll records',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll records retrieved successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  findAll() {
    return this.payrollService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.view')
  @ApiOperation({
    summary: 'Get payroll by ID',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Payroll ID',
    example: '8f1cbaf8-1db8-4f2d-9287-5b3d8d7d6f31',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll record retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll record not found.',
  })
  findOne(@Param('id') id: string) {
    return this.payrollService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.update')
  @ApiOperation({
    summary: 'Update payroll',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Payroll ID',
    example: '8f1cbaf8-1db8-4f2d-9287-5b3d8d7d6f31',
  })
  @ApiBody({
    type: UpdatePayrollDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll record not found.',
  })
  update(@Param('id') id: string, @Body() dto: UpdatePayrollDto) {
    return this.payrollService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.delete')
  @ApiOperation({
    summary: 'Delete payroll',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Payroll ID',
    example: '8f1cbaf8-1db8-4f2d-9287-5b3d8d7d6f31',
  })
  @ApiResponse({
    status: 200,
    description: 'Payroll deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Payroll record not found.',
  })
  remove(@Param('id') id: string) {
    return this.payrollService.remove(id);
  }
}
