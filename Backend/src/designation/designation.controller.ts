import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';

import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { DesignationService } from './designation.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';

@ApiTags('Designations')
@Controller('designations')
export class DesignationController {
  constructor(private readonly designationService: DesignationService) {}

  @Post()
  @ApiOperation({
    summary: 'Create designation',
    description: 'Creates a new employee designation',
  })
  @ApiResponse({
    status: 201,
    description: 'Designation created successfully',
  })
  create(@Body() createDesignationDto: CreateDesignationDto) {
    return this.designationService.create(createDesignationDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all designations',
    description: 'Returns all available designations',
  })
  @ApiResponse({
    status: 200,
    description: 'Designations fetched successfully',
  })
  findAll() {
    return this.designationService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get designation by ID',
    description: 'Returns a single designation using its UUID',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Designation UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Designation found successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found',
  })
  findOne(@Param('id') id: string) {
    return this.designationService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update designation',
    description: 'Updates an existing designation',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Designation UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Designation updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found',
  })
  update(
    @Param('id') id: string,
    @Body() updateDesignationDto: UpdateDesignationDto,
  ) {
    return this.designationService.update(id, updateDesignationDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete designation',
    description: 'Deletes a designation by ID',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Designation UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Designation deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found',
  })
  remove(@Param('id') id: string) {
    return this.designationService.remove(id);
  }
}
