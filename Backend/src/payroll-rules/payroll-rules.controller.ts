import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
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

import { PayrollRulesService } from './payroll-rules.service';
import { CreatePayrollRuleDto } from './dto/create-payroll-rule.dto';
import { UpdatePayrollRuleDto } from './dto/update-payroll-rule.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Payroll Rules')
@Controller('payroll-rules')
export class PayrollRulesController {
  constructor(private readonly payrollRulesService: PayrollRulesService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-rules.create')
  @ApiOperation({ summary: 'Create a payroll rule' })
  @ApiBody({ type: CreatePayrollRuleDto })
  @ApiResponse({ status: 201, description: 'Rule created.' })
  @ApiResponse({ status: 400, description: 'Invalid rule config.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-rules.create permission.',
  })
  create(@Body() dto: CreatePayrollRuleDto) {
    return this.payrollRulesService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-rules.view')
  @ApiOperation({ summary: 'List payroll rules' })
  @ApiQuery({ name: 'rule_type', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Rules retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-rules.view permission.',
  })
  findAll(
    @Query('rule_type') ruleType?: string,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.payrollRulesService.findAll(ruleType, includeInactive ?? false);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-rules.view')
  @ApiOperation({ summary: 'Get a payroll rule by id' })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiResponse({ status: 200, description: 'Rule retrieved.' })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollRulesService.findOne(id);
  }

  @Get(':id/versions')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-rules.view')
  @ApiOperation({
    summary: 'Get the full version lineage of a rule',
    description:
      'Returns every version of the rule oldest → newest, following the supersede chain (spec §16).',
  })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiResponse({ status: 200, description: 'Version history retrieved.' })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  versions(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollRulesService.versions(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-rules.update')
  @ApiOperation({
    summary: 'Update a payroll rule (creates a new version)',
    description:
      'Rules are versioned: updating an active rule stores a new version and supersedes the old one rather than editing in place.',
  })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiBody({ type: UpdatePayrollRuleDto })
  @ApiResponse({ status: 200, description: 'Rule updated (new version).' })
  @ApiResponse({ status: 400, description: 'Invalid rule config.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-rules.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePayrollRuleDto,
  ) {
    return this.payrollRulesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('payroll-rules.delete')
  @ApiOperation({ summary: 'Delete a payroll rule' })
  @ApiParam({ name: 'id', description: 'Rule UUID' })
  @ApiResponse({ status: 200, description: 'Rule deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing payroll-rules.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Rule not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.payrollRulesService.remove(id);
  }
}
