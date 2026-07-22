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

import { UserService } from './users.service';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}

  @Post()
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
  @ApiOperation({
    summary: 'Get all users',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all users.',
  })
  findAll() {
    return this.userService.findAll();
  }

  @Get(':id')
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

  @Delete(':id')
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