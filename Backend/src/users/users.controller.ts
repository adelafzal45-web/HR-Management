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

import { UserService } from './users.service';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';
@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @UseGuards(PermissionGuard)
@RequirePermission('employees.create')
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new employee/user in the HR Management System.',
  })
  @ApiBody({
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
 /* @UseGuards(PermissionGuard)
 @RequirePermission('employees.view')*/
  @ApiOperation({
    summary: 'Get all users',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all users.',
  })
  findAll()
   {
    return this.userService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('employees.create')
  @ApiOperation({
    summary: 'Get a user by ID',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description: 'User found.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
 @UseGuards(PermissionGuard)
@RequirePermission('employees.update')
  @ApiOperation({
    summary: 'Update a user',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('employees.delete')
  @ApiOperation({
    summary: 'Delete a user',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  delete(@Param('id') id: string) {
    return this.userService.delete(id);
  }
}
