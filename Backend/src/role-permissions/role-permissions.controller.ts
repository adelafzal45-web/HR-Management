import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';

import { RolePermissionsService } from './role-permissions.service';

import { CreateRolePermissionDto } from './dto/create-role-permission.dto';

@Controller('role-permissions')
export class RolePermissionsController {
  constructor(private readonly rolePermissionService: RolePermissionsService) {}

  @Post()
  create(@Body() dto: CreateRolePermissionDto) {
    return this.rolePermissionService.create(dto);
  }

  @Get()
  findAll() {
    return this.rolePermissionService.findAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rolePermissionService.remove(id);
  }
}
