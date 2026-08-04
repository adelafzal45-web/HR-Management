import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';

import { UpdateRoleDto } from './dto/update-role.dto';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { SettingsListQueryDto } from '../common/dto/settings-list-query.dto';

import { RoleService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('roles.create')
  @ApiOperation({
    summary: 'Create a new role',
    description: 'Creates a new role in the HR Management System.',
  })
  @ApiBody({
    type: CreateRoleDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Role created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.roleService.create(createRoleDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all roles',
    description:
      'Supports `?search=`, `?page=` and `?pageSize=`. Omit `pageSize` to get every role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns `{ data, total }`.',
  })
  findAll(@Query() query: SettingsListQueryDto) {
    return this.roleService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a role by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Role UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiResponse({
    status: 200,
    description: 'Role found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Role not found.',
  })
  findOne(@Param('id') id: string) {
    return this.roleService.findOne(id);
  }
  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('roles.update')
  @ApiOperation({
    summary: 'Update a role',
  })
  @ApiParam({
    name: 'id',
    description: 'Role UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Role updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Role not found.',
  })
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.roleService.update(id, updateRoleDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('roles.delete')
  @ApiOperation({
    summary: 'Delete a role',
  })
  @ApiParam({
    name: 'id',
    description: 'Role UUID',
    example: '7d86f0b2-5c28-4f69-9bb2-cd4c90dd6d34',
  })
  @ApiResponse({
    status: 200,
    description: 'Role deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Role not found.',
  })
  remove(@Param('id') id: string) {
    return this.roleService.remove(id);
  }
}
