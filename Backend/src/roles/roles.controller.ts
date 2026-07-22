import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { RoleService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Post()
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
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all roles.',
  })
  findAll() {
    return this.roleService.findAll();
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

  @Delete(':id')
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
