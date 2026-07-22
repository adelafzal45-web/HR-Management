import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly permissionService: PermissionsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new permission',
    description: 'Creates a new permission in the HR Management System.',
  })
  @ApiBody({
    type: CreatePermissionDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Permission created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() createPermissionDto: CreatePermissionDto) {
    return this.permissionService.create(createPermissionDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all permissions',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all permissions.',
  })
  findAll() {
    return this.permissionService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get permission by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Permission UUID',
    example: 'd0dff72c-5c65-49a0-8d54-0d1c2c76d8af',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Permission not found.',
  })
  findOne(@Param('id') id: string) {
    return this.permissionService.findOne(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a permission',
  })
  @ApiParam({
    name: 'id',
    description: 'Permission UUID',
    example: 'd0dff72c-5c65-49a0-8d54-0d1c2c76d8af',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Permission not found.',
  })
  remove(@Param('id') id: string) {
    return this.permissionService.delete(id);
  }
}