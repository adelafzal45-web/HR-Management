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

import { SalaryStructuresService } from './salary-structures.service';
import { CreateSalaryStructureDto } from './dto/create-salary-structure.dto';
import { UpdateSalaryStructureDto } from './dto/update-salary-structure.dto';
import { StructureComponentDto } from './dto/create-salary-structure.dto';
import { UpdateStructureComponentDto } from './dto/update-structure-component.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Salary Structures')
@Controller('salary-structures')
export class SalaryStructuresController {
  constructor(
    private readonly salaryStructuresService: SalaryStructuresService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.create')
  @ApiOperation({ summary: 'Create a salary structure' })
  @ApiBody({ type: CreateSalaryStructureDto })
  @ApiResponse({ status: 201, description: 'Structure created.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.create permission.',
  })
  @ApiResponse({
    status: 409,
    description: 'A structure with that name exists.',
  })
  create(@Body() dto: CreateSalaryStructureDto) {
    return this.salaryStructuresService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.view')
  @ApiOperation({ summary: 'List all salary structures with their components' })
  @ApiResponse({ status: 200, description: 'Structures retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.view permission.',
  })
  findAll() {
    return this.salaryStructuresService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.view')
  @ApiOperation({ summary: 'Get a salary structure by id' })
  @ApiParam({ name: 'id', description: 'Structure UUID' })
  @ApiResponse({ status: 200, description: 'Structure retrieved.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.view permission.',
  })
  @ApiResponse({ status: 404, description: 'Structure not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryStructuresService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.update')
  @ApiOperation({ summary: 'Update a salary structure' })
  @ApiParam({ name: 'id', description: 'Structure UUID' })
  @ApiBody({ type: UpdateSalaryStructureDto })
  @ApiResponse({ status: 200, description: 'Structure updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Structure not found.' })
  @ApiResponse({
    status: 409,
    description: 'A structure with that name exists.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSalaryStructureDto,
  ) {
    return this.salaryStructuresService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.delete')
  @ApiOperation({ summary: 'Delete a salary structure' })
  @ApiParam({ name: 'id', description: 'Structure UUID' })
  @ApiResponse({ status: 200, description: 'Structure deleted.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.delete permission.',
  })
  @ApiResponse({ status: 404, description: 'Structure not found.' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.salaryStructuresService.remove(id);
  }

  // ---- Nested component membership ---------------------------------------

  @Post(':id/components')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.update')
  @ApiOperation({ summary: 'Add a component to a structure' })
  @ApiParam({ name: 'id', description: 'Structure UUID' })
  @ApiBody({ type: StructureComponentDto })
  @ApiResponse({ status: 201, description: 'Component added to structure.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Structure or component not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'That component is already on the structure.',
  })
  addComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StructureComponentDto,
  ) {
    return this.salaryStructuresService.addComponent(id, dto);
  }

  @Patch(':id/components/:structureComponentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.update')
  @ApiOperation({ summary: 'Update a component membership on a structure' })
  @ApiParam({ name: 'id', description: 'Structure UUID' })
  @ApiParam({ name: 'structureComponentId', description: 'Membership UUID' })
  @ApiBody({ type: UpdateStructureComponentDto })
  @ApiResponse({ status: 200, description: 'Membership updated.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Membership not found.' })
  updateComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('structureComponentId', ParseUUIDPipe) structureComponentId: string,
    @Body() dto: UpdateStructureComponentDto,
  ) {
    return this.salaryStructuresService.updateComponent(
      id,
      structureComponentId,
      dto,
    );
  }

  @Delete(':id/components/:structureComponentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('salary-structures.update')
  @ApiOperation({ summary: 'Remove a component from a structure' })
  @ApiParam({ name: 'id', description: 'Structure UUID' })
  @ApiParam({ name: 'structureComponentId', description: 'Membership UUID' })
  @ApiResponse({
    status: 200,
    description: 'Component removed from structure.',
  })
  @ApiResponse({
    status: 403,
    description: 'Missing salary-structures.update permission.',
  })
  @ApiResponse({ status: 404, description: 'Membership not found.' })
  removeComponent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('structureComponentId', ParseUUIDPipe) structureComponentId: string,
  ) {
    return this.salaryStructuresService.removeComponent(
      id,
      structureComponentId,
    );
  }
}
