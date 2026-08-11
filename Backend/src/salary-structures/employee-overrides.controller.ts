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

import { SalaryStructuresService } from './salary-structures.service';
import { CreateEmployeeOverrideDto } from './dto/create-employee-override.dto';
import { UpdateEmployeeOverrideDto } from './dto/update-employee-override.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

/**
 * Per-employee component overrides (spec §12, narrowest scope). Managed with the
 * same `salary-structures.*` permissions since it's part of the same
 * assignment/priority story.
 */
@ApiTags('Employee Component Overrides')
@Controller('employee-component-overrides')
export class EmployeeOverridesController {
  constructor(
    private readonly salaryStructuresService: SalaryStructuresService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.create')
  @ApiOperation({ summary: 'Create a per-employee component override' })
  @ApiBody({ type: CreateEmployeeOverrideDto })
  @ApiResponse({ status: 201, description: 'Override created.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.create permission.',
  })
  @ApiResponse({ status: 404, description: 'Component not found.' })
  create(@Body() dto: CreateEmployeeOverrideDto) {
    return this.salaryStructuresService.createOverride(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.view')
  @ApiOperation({
    summary: 'List employee component overrides',
    description: 'Optionally filter by userId.',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiResponse({ status: 200, description: 'Overrides retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.view permission.',
  })
  findAll(@Query('userId') userId?: string) {
    return this.salaryStructuresService.findOverrides(userId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.update')
  @ApiOperation({ summary: 'Update an employee component override' })
  @ApiParam({ name: 'id', description: 'Override UUID' })
  @ApiBody({ type: UpdateEmployeeOverrideDto })
  @ApiResponse({ status: 200, description: 'Override updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Override not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeOverrideDto,
  ) {
    return this.salaryStructuresService.updateOverride(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.delete')
  @ApiOperation({ summary: 'Delete an employee component override' })
  @ApiParam({ name: 'id', description: 'Override UUID' })
  @ApiResponse({ status: 200, description: 'Override deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Override not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryStructuresService.removeOverride(id);
  }
}
