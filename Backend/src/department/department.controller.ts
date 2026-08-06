import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Patch,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { DepartmentsService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ReassignAndDeleteDepartmentDto } from './dto/reassign-department.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentService: DepartmentsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.create')
  @ApiOperation({
    summary: 'Create a new department',
    description: 'Creates a new department in the HR Management System.',
  })
  @ApiBody({
    type: CreateDepartmentDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Department created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() createDepartmentDto: CreateDepartmentDto) {
    return this.departmentService.create(createDepartmentDto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.view')
  @ApiOperation({
    summary: 'Get all departments',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all departments.',
  })
  findAll() {
    return this.departmentService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.view')
  @ApiOperation({
    summary: 'Get a department by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiResponse({
    status: 200,
    description: 'Department found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Department not found.',
  })
  findOne(@Param('id') id: string) {
    return this.departmentService.findOne(id);
  }
  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.update')
  @ApiOperation({
    summary: 'Update a department',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID',
  })
  @ApiBody({
    type: UpdateDepartmentDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Department updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Department not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
  ) {
    return this.departmentService.update(id, updateDepartmentDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.delete')
  @ApiOperation({
    summary: 'Delete a department',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiResponse({
    status: 200,
    description: 'Department deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Department not found.',
  })
  remove(@Param('id') id: string) {
    return this.departmentService.delete(id);
  }

  @Get(':id/delete-impact')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.delete')
  @ApiOperation({
    summary: 'What is blocking this department from being deleted',
    description:
      'Employee count, designation count and how many of those designations ' +
      'somebody actually holds. Lets the delete dialog name the blockers ' +
      'before the user commits.',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Impact summary returned.',
  })
  @ApiResponse({
    status: 404,
    description: 'Department not found.',
  })
  deleteImpact(@Param('id') id: string) {
    return this.departmentService.getDeleteImpact(id);
  }

  @Post(':id/reassign-and-delete')
  @UseGuards(PermissionGuard)
  @RequirePermission('departments.delete')
  @ApiOperation({
    summary: 'Move employees and designations elsewhere, then delete',
    description:
      'Single transaction. Every employee and designation in this department ' +
      'is moved to the target department, then this department is deleted.',
  })
  @ApiParam({
    name: 'id',
    description: 'Department UUID to delete',
  })
  @ApiBody({
    type: ReassignAndDeleteDepartmentDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Everything moved and the department deleted.',
  })
  @ApiResponse({
    status: 404,
    description: 'Department or target department not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Target department is the one being deleted.',
  })
  reassignAndDelete(
    @Param('id') id: string,
    @Body() dto: ReassignAndDeleteDepartmentDto,
  ) {
    return this.departmentService.reassignAndDelete(
      id,
      dto.target_department_id,
    );
  }
}
