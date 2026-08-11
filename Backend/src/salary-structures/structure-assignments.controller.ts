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
import { CreateStructureAssignmentDto } from './dto/create-assignment.dto';
import { UpdateStructureAssignmentDto } from './dto/update-assignment.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

/**
 * Structure → scope assignments (spec §12/§13). Kept on their own path rather
 * than nested under a structure id so the calculation service and the UI can
 * list every assignment at once for priority resolution. Gated by the same
 * `salary-structures.*` permissions as the structures themselves.
 */
@ApiTags('Salary Structure Assignments')
@Controller('salary-structure-assignments')
export class StructureAssignmentsController {
  constructor(
    private readonly salaryStructuresService: SalaryStructuresService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.create')
  @ApiOperation({ summary: 'Assign a structure to a scope' })
  @ApiBody({ type: CreateStructureAssignmentDto })
  @ApiResponse({ status: 201, description: 'Assignment created.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.create permission.',
  })
  @ApiResponse({ status: 404, description: 'Structure not found.' })
  create(@Body() dto: CreateStructureAssignmentDto) {
    return this.salaryStructuresService.createAssignment(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.view')
  @ApiOperation({
    summary: 'List structure assignments',
    description: 'Optionally filter by structureId.',
  })
  @ApiQuery({ name: 'structureId', required: false })
  @ApiResponse({ status: 200, description: 'Assignments retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.view permission.',
  })
  findAll(@Query('structureId') structureId?: string) {
    return this.salaryStructuresService.findAssignments(structureId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.update')
  @ApiOperation({ summary: 'Update a structure assignment' })
  @ApiParam({ name: 'id', description: 'Assignment UUID' })
  @ApiBody({ type: UpdateStructureAssignmentDto })
  @ApiResponse({ status: 200, description: 'Assignment updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Assignment not found.' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStructureAssignmentDto,
  ) {
    return this.salaryStructuresService.updateAssignment(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.delete')
  @ApiOperation({ summary: 'Delete a structure assignment' })
  @ApiParam({ name: 'id', description: 'Assignment UUID' })
  @ApiResponse({ status: 200, description: 'Assignment deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Assignment not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryStructuresService.removeAssignment(id);
  }
}
