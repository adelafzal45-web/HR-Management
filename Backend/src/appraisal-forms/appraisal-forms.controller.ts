import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
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

import { AppraisalFormsService } from './appraisal-forms.service';
import { CreateAppraisalFormsDto } from './dto/create-appraisal-forms.dto';
import { UpdateAppraisalFormsDto } from './dto/update-appraisal-form.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Appraisal Forms')
@ApiBearerAuth('JWT')
@Controller('appraisal-forms')
export class AppraisalFormsController {
  constructor(private readonly appraisalFormsService: AppraisalFormsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.create')
  @ApiOperation({ summary: 'Create a new appraisal form' })
  @ApiBody({ type: CreateAppraisalFormsDto })
  @ApiResponse({
    status: 201,
    description: 'Appraisal form created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request body.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  create(@Body() createDto: CreateAppraisalFormsDto) {
    return this.appraisalFormsService.create(createDto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.view')
  @ApiOperation({ summary: 'Get all appraisal forms' })
  @ApiResponse({
    status: 200,
    description: 'List of appraisal forms.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized.',
  })
  findAll() {
    return this.appraisalFormsService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.view.own')
  @ApiOperation({ summary: 'Get appraisal form by ID' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Appraisal Form ID',
    example: '5cb6f22b-c09e-48e3-8c67-1c5d3d74d231',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal form found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal form not found.',
  })
  findOne(@Param('id') id: string) {
    return this.appraisalFormsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.update')
  @ApiOperation({ summary: 'Update appraisal form' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Appraisal Form ID',
    example: '5cb6f22b-c09e-48e3-8c67-1c5d3d74d231',
  })
  @ApiBody({ type: UpdateAppraisalFormsDto })
  @ApiResponse({
    status: 200,
    description: 'Appraisal form updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal form not found.',
  })
  update(@Param('id') id: string, @Body() updateDto: UpdateAppraisalFormsDto) {
    return this.appraisalFormsService.update(id, updateDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.delete')
  @ApiOperation({ summary: 'Delete appraisal form' })
  @ApiParam({
    name: 'id',
    type: String,
    description: 'Appraisal Form ID',
    example: '5cb6f22b-c09e-48e3-8c67-1c5d3d74d231',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal form deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal form not found.',
  })
  remove(@Param('id') id: string) {
    return this.appraisalFormsService.remove(id);
  }
}
