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
import { ReassignAndDeleteDesignationDto } from './dto/reassign-designation.dto';
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

  @Get(':id/delete-impact')
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.delete')
  @ApiOperation({
    summary: 'What is blocking this designation from being deleted',
    description:
      'How many employees still hold it. Lets the delete dialog name the ' +
      'blocker before the user commits.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Designation ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Impact summary returned.',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation not found.',
  })
  deleteImpact(@Param('id') id: string) {
    return this.designationService.getDeleteImpact(id);
  }

  @Post(':id/reassign-and-delete')
  @UseGuards(PermissionGuard)
  @RequirePermission('designation.delete')
  @ApiOperation({
    summary: 'Move the holders to another designation, then delete',
    description:
      'Single transaction. Employees holding this designation are moved to ' +
      'the target — including their department, which is realigned to the ' +
      "target's — then this designation is deleted.",
  })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Designation ID to delete',
  })
  @ApiBody({ type: ReassignAndDeleteDesignationDto })
  @ApiResponse({
    status: 201,
    description: 'Employees moved and the designation deleted.',
  })
  @ApiResponse({
    status: 404,
    description: 'Designation or target designation not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Target designation is the one being deleted.',
  })
  reassignAndDelete(
    @Param('id') id: string,
    @Body() dto: ReassignAndDeleteDesignationDto,
  ) {
    return this.designationService.reassignAndDelete(
      id,
      dto.target_designation_id,
    );
  }
}
