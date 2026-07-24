import {
  Controller,
  Get,
  Post,
 Patch,
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

import { ShiftsService } from './shifts.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

@ApiTags('Shifts')
@Controller('shifts')
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create Shift',
  })
  @ApiBody({
    type: CreateShiftDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Shift created successfully.',
  })
  create(@Body() dto: CreateShiftDto) {
    return this.shiftsService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all shifts',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all shifts.',
  })
  findAll() {
    return this.shiftsService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get shift by ID',
  })
  @ApiParam({
    name: 'id',
    example: '7bb4c8f2-d98d-45c7-a01d-4932fb42e501',
  })
  findOne(@Param('id') id: string) {
    return this.shiftsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update shift',
  })
  @ApiBody({
    type: UpdateShiftDto,
  })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    return this.shiftsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete shift',
  })
  remove(@Param('id') id: string) {
    return this.shiftsService.remove(id);
  }
}