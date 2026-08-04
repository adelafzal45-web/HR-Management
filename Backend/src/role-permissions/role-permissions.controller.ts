import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Patch,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { RolePermissionsService } from './role-permissions.service';
import { CreateRolePermissionDto } from './dto/create-role-permission.dto';
import { UpdateRolePermissionDto } from './dto/update-role.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Role Permissions')
@Controller('role-permissions')
export class RolePermissionsController {
  constructor(private readonly rolePermissionService: RolePermissionsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('roles.update')
  @ApiOperation({
    summary: 'Assign a permission to a role',
    description: 'Creates a new relationship between a role and a permission.',
  })
  @ApiBody({
    type: CreateRolePermissionDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Permission assigned to role successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() dto: CreateRolePermissionDto) {
    return this.rolePermissionService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all role-permission mappings',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all role-permission mappings.',
  })
  findAll() {
    return this.rolePermissionService.findAll();
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('roles.update')
  @ApiOperation({
    summary: 'Update a role-permission mapping',
  })
  @ApiParam({
    name: 'id',
    description: 'Role Permission UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Role permission updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Role or Permission not found.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateRolePermissionDto) {
    return this.rolePermissionService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('roles.update')
  @ApiOperation({
    summary: 'Remove a role-permission mapping',
  })
  @ApiParam({
    name: 'id',
    description: 'Role Permission UUID',
    example: '3a8d91d2-3b61-4d3c-b5e2-c7d1a2b8c123',
  })
  @ApiResponse({
    status: 200,
    description: 'Role permission removed successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Role permission not found.',
  })
  remove(@Param('id') id: string) {
    return this.rolePermissionService.remove(id);
  }
}
