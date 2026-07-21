import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
} from '@nestjs/common';

import { PermissionsService } from './permissions.service';
import { Permission } from './permission.entity';

@Controller('permissions')
export class PermissionsController {

  constructor(
    private readonly permissionService: PermissionsService,
  ) {}

  @Post()
  create(@Body() permission: Partial<Permission>) {
    return this.permissionService.create(permission);
  }

  @Get()
  findAll() {
    return this.permissionService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.permissionService.delete(id);
  }
}