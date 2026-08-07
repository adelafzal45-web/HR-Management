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

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';

import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { SettingsListQueryDto } from '../common/dto/settings-list-query.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Permissions')
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionService: PermissionsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('permissions.create')
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
    description:
      'Supports `?search=`, `?page=` and `?pageSize=`. Omit `pageSize` to get every permission — which is what the Roles screen does to build its checkbox tree.',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns `{ data, total }`.',
  })
  findAll(@Query() query: SettingsListQueryDto) {
    return this.permissionService.findAll(query);
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

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('permissions.update')
  @ApiOperation({
    summary: 'Update a permission',
    description:
      'Renames a permission or edits its description. Renaming changes the key every `@RequirePermission` compares against, so it will revoke access anywhere the old key is still hard-coded in a controller.',
  })
  @ApiParam({
    name: 'id',
    description: 'Permission UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Permission updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Permission not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Another permission already uses that name.',
  })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('permissions.delete')
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
