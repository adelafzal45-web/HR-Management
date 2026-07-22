import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';

import { DepartmentsService } from './department.service';
import { Department } from './department.entity';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentService: DepartmentsService) {}

  @Post()
  create(@Body() department: Partial<Department>) {
    return this.departmentService.create(department);
  }

  @Get()
  findAll() {
    return this.departmentService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.departmentService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.departmentService.delete(id);
  }
}
