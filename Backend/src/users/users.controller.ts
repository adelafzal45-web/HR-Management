import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Patch,
  UseGuards,
} from '@nestjs/common';

import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';

import { UserService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ==========================================
  // CREATE USER
  // ==========================================

  @Post()
  @UseGuards(PermissionGuard)
  /*@RequirePermission('employees.create')
  @ApiOperation({
    summary: 'Create a new user',
    description: 'Creates a new employee/user in the HR Management System.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user performing this action. Currently used for permission checking until JWT authentication is implemented.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })*/
  @ApiBody({
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'The current user does not have employees.create permission.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  // ==========================================
  // GET ALL USERS
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Get all users',
    description:
      'Returns all users/employees. The current user must have employees.view permission.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description: 'UUID of the user performing this action.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all users.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'The current user does not have employees.view permission.',
  })
  findAll() {
    return this.userService.findAll();
  }

  // ==========================================
  // GET USER BY ID
  // ==========================================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.view')
  @ApiOperation({
    summary: 'Get a user by ID',
    description:
      'Returns a specific user. The current user must have employees.view permission.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description: 'UUID of the user performing this action.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user to retrieve.',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description: 'User found.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'The current user does not have employees.view permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  // ==========================================
  // UPDATE USER
  // ==========================================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.update')
  @ApiOperation({
    summary: 'Update a user',
    description:
      'Updates an existing user. The current user must have employees.update permission.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description: 'UUID of the user performing this action.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user to update.',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiBody({
    type: UpdateUserDto,
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'The current user does not have employees.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  // ==========================================
  // DELETE USER
  // ==========================================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('employees.delete')
  @ApiOperation({
    summary: 'Delete a user',
    description:
      'Deletes an existing user. The current user must have employees.delete permission.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description: 'UUID of the user performing this action.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user to delete.',
    example: '8f52df59-6b08-42c2-94f6-7a5d34f3d1d5',
  })
  @ApiResponse({
    status: 200,
    description: 'User deleted successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'The current user does not have employees.delete permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found.',
  })
  delete(@Param('id') id: string) {
    return this.userService.delete(id);
  }
}
