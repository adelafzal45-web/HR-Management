import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { PayrollService } from './payroll.service';

import { CreatePayrollDto } from './dto/create-payroll.dto';
import { UpdatePayrollDto } from './dto/update-payroll.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Payroll')
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post()
  @UseGuards(PermissionGuard)
@RequirePermission('payroll.create')
  @ApiOperation({
    summary: 'Create payroll',
  })
  @ApiBody({
    type: CreatePayrollDto,
  })
  create(@Body() dto: CreatePayrollDto) {
    return this.payrollService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
@RequirePermission('payroll.view')
  findAll() {
    return this.payrollService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('payroll.view')
  @ApiParam({
    name: 'id',
  })
  findOne(@Param('id') id: string) {
    return this.payrollService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('payroll.update')
  update(@Param('id') id: string, @Body() dto: UpdatePayrollDto) {
    return this.payrollService.update(id, dto);
  }

  @Delete(':id')
@UseGuards(PermissionGuard)
@RequirePermission('payroll.delete')
  remove(@Param('id') id: string) {
    return this.payrollService.remove(id);
  }
}
