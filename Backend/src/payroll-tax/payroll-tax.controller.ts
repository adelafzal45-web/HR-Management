import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { PayrollTaxService } from './payroll-tax.service';
import { CreateTaxConfigDto } from './dto/create-tax-config.dto';
import { UpdateTaxConfigDto } from './dto/update-tax-config.dto';
import { PreviewTaxDto } from './dto/preview-tax.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Payroll Tax')
@Controller('payroll-tax')
export class PayrollTaxController {
  constructor(private readonly payrollTaxService: PayrollTaxService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-tax.create')
  @ApiOperation({ summary: 'Create a tax config with slabs' })
  @ApiBody({ type: CreateTaxConfigDto })
  @ApiResponse({ status: 201, description: 'Tax config created.' })
  @ApiResponse({ status: 400, description: 'Invalid slab ladder.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-tax.create permission.',
  })
  create(@Body() dto: CreateTaxConfigDto) {
    return this.payrollTaxService.create(dto);
  }

  /**
   * "Preview tax on ₨X": runs a sample annual income through a config's slabs.
   * Gated by `payroll.preview` like the formula test — a calculation dry run.
   */
  @Post('preview')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll.preview')
  @ApiOperation({ summary: 'Preview tax for a sample annual income' })
  @ApiBody({ type: PreviewTaxDto })
  @ApiResponse({ status: 200, description: 'Tax computation.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll.preview permission.',
  })
  preview(@Body() dto: PreviewTaxDto) {
    return this.payrollTaxService.preview(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-tax.view')
  @ApiOperation({ summary: 'List tax configs' })
  @ApiResponse({ status: 200, description: 'Tax configs retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-tax.view permission.',
  })
  findAll() {
    return this.payrollTaxService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-tax.view')
  @ApiOperation({ summary: 'Get a tax config by id' })
  @ApiParam({ name: 'id', description: 'Tax config UUID' })
  @ApiResponse({ status: 200, description: 'Tax config retrieved.' })
  @ApiResponse({ status: 404, description: 'Tax config not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollTaxService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-tax.update')
  @ApiOperation({ summary: 'Update a tax config (replaces slabs when supplied)' })
  @ApiParam({ name: 'id', description: 'Tax config UUID' })
  @ApiBody({ type: UpdateTaxConfigDto })
  @ApiResponse({ status: 200, description: 'Tax config updated.' })
  @ApiResponse({ status: 400, description: 'Invalid slab ladder.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-tax.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Tax config not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxConfigDto,
  ) {
    return this.payrollTaxService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-tax.delete')
  @ApiOperation({ summary: 'Delete a tax config' })
  @ApiParam({ name: 'id', description: 'Tax config UUID' })
  @ApiResponse({ status: 200, description: 'Tax config deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-tax.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Tax config not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollTaxService.remove(id);
  }
}
