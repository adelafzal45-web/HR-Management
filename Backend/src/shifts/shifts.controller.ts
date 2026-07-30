import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  // ==========================================
  // CREATE SHIFT
  // ==========================================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('shifts.create')
  @ApiOperation({
    summary: 'Create Shift',
    description: 'Creates a new shift.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Temporary authentication header until JWT is implemented.',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({
    type: CreateShiftDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Shift created successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have shifts.create permission.',
  })
  create(@Body() dto: CreateShiftDto) {
    return this.shiftsService.create(dto);
  }

  // ==========================================
  // GET ALL SHIFTS
  // ==========================================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('shifts.view')
  @ApiOperation({
    summary: 'Get all shifts',
    description: 'Returns all shifts.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Temporary authentication header until JWT is implemented.',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all shifts.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have shifts.view permission.',
  })
  findAll() {
    return this.shiftsService.findAll();
  }

  // ==========================================
  // GET SHIFT BY ID
  // ==========================================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('shifts.view')
  @ApiOperation({
    summary: 'Get shift by ID',
    description: 'Returns a single shift by its UUID.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Temporary authentication header until JWT is implemented.',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'id',
    description: 'Shift UUID',
    example: '7bb4c8f2-d98d-45c7-a01d-4932fb42e501',
  })
  @ApiResponse({
    status: 200,
    description: 'Shift found successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have shifts.view permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Shift not found.',
  })
  findOne(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  // ==========================================
  // UPDATE SHIFT
  // ==========================================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('shifts.update')
  @ApiOperation({
    summary: 'Update shift',
    description: 'Updates an existing shift.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Temporary authentication header until JWT is implemented.',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'id',
    description: 'Shift UUID',
    example: '7bb4c8f2-d98d-45c7-a01d-4932fb42e501',
  })
  @ApiBody({
    type: UpdateShiftDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Shift updated successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have shifts.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Shift not found.',
  })
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(id, dto);
  }

  // ==========================================
  // DELETE SHIFT
  // ==========================================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('shifts.delete')
  @ApiOperation({
    summary: 'Delete shift',
    description: 'Deletes an existing shift.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Temporary authentication header until JWT is implemented.',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'id',
    description: 'Shift UUID',
    example: '7bb4c8f2-d98d-45c7-a01d-4932fb42e501',
  })
  @ApiResponse({
    status: 200,
    description: 'Shift deleted successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID header is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have shifts.delete permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Shift not found.',
  })
  remove(@Param('id') id: string) {
    return this.shiftsService.remove(id);
  }
}
