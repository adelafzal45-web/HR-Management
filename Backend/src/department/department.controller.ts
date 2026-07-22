import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { DepartmentsService } from './department.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@ApiTags('Departments')
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentService: DepartmentsService) {}

  @Post()
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

  @Delete(':id')
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
}
