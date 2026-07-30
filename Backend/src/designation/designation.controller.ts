import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { DesignationService } from './designation.service';
import { CreateDesignationDto } from './dto/create-designation.dto';
import { UpdateDesignationDto } from './dto/update-designation.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Designations')
@ApiBearerAuth('JWT')
@Controller('designations')
export class DesignationController {
  constructor(private readonly designationService: DesignationService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.create')
  @ApiOperation({ summary: 'Create a new designation' })
  @ApiBody({ type: CreateDesignationDto })
  @ApiResponse({
    status: 201,
    description: 'Designation created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  create(@Body() createDesignationDto: CreateDesignationDto) {
    return this.designationService.create(createDesignationDto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.view')
  @ApiOperation({ summary: 'Get all designations' })
  @ApiResponse({
    status: 200,
    description: 'List of designations.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  findAll() {
    return this.designationService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.view')
  @ApiOperation({ summary: 'Get designation by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Designation ID',
    example: '9d09d20d-04dc-45f5-9255-f05c57fd62de',
  })
  @ApiResponse({
    status: 200,
    description: 'Designation found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found.',
  })
  findOne(@Param('id') id: string) {
    return this.designationService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.update')
  @ApiOperation({ summary: 'Update designation' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Designation ID',
    example: '9d09d20d-04dc-45f5-9255-f05c57fd62de',
  })
  @ApiBody({ type: UpdateDesignationDto })
  @ApiResponse({
    status: 200,
    description: 'Designation updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateDesignationDto: UpdateDesignationDto,
  ) {
    return this.designationService.update(id, updateDesignationDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.delete')
  @ApiOperation({ summary: 'Delete designation' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Designation ID',
    example: '9d09d20d-04dc-45f5-9255-f05c57fd62de',
  })
  @ApiResponse({
    status: 200,
    description: 'Designation deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found.',
  })
  remove(@Param('id') id: string) {
    return this.designationService.remove(id);
  }
}
