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

import { AppraisalQuestionService } from './appraisal-question.service';
import { CreateAppraisalQuestionDto } from './dto/create-appraisal-question.dto';
import { UpdateAppraisalQuestionDto } from './dto/update-appraisal-question.dto';

import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Appraisal Questions')
@Controller('appraisal-question')
export class AppraisalQuestionController {
  constructor(
    private readonly appraisalQuestionService: AppraisalQuestionService,
  ) {}

  // ============================
  // CREATE
  // ============================

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.create')
  @ApiOperation({
    summary: 'Create appraisal question',
    description: 'Creates a new appraisal question.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Used to check permissions.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiBody({
    type: CreateAppraisalQuestionDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Appraisal question created successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have appraisal.create permission.',
  })
  create(@Body() createAppraisalQuestionDto: CreateAppraisalQuestionDto) {
    return this.appraisalQuestionService.create(createAppraisalQuestionDto);
  }

  // ============================
  // GET ALL
  // ============================

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({
    summary: 'Get all appraisal questions',
    description: 'Returns all appraisal questions.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Used to check permissions.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal questions fetched successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have appraisal.view permission.',
  })
  findAll() {
    return this.appraisalQuestionService.findAll();
  }

  // ============================
  // GET ONE
  // ============================

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({
    summary: 'Get appraisal question by ID',
    description: 'Returns a single appraisal question.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Used to check permissions.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Question UUID',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question found successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have appraisal.view permission.',
  })
  findOne(@Param('id') id: string) {
    return this.appraisalQuestionService.findOne(id);
  }

  // ============================
  // UPDATE
  // ============================

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.update')
  @ApiOperation({
    summary: 'Update appraisal question',
    description: 'Updates an existing appraisal question.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Used to check permissions.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Question UUID',
  })
  @ApiBody({
    type: UpdateAppraisalQuestionDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question updated successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have appraisal.update permission.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateAppraisalQuestionDto: UpdateAppraisalQuestionDto,
  ) {
    return this.appraisalQuestionService.update(
      id,
      updateAppraisalQuestionDto,
    );
  }

  // ============================
  // DELETE
  // ============================

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.delete')
  @ApiOperation({
    summary: 'Delete appraisal question',
    description: 'Deletes an appraisal question.',
  })
  @ApiHeader({
    name: 'x-user-id',
    description:
      'UUID of the user making the request. Used to check permissions.',
    required: true,
    example: 'dced0533-ad5e-4f86-8e76-34e9a4e78451',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Question UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question deleted successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'User ID is missing.',
  })
  @ApiResponse({
    status: 403,
    description: 'User does not have appraisal.delete permission.',
  })
  remove(@Param('id') id: string) {
    return this.appraisalQuestionService.remove(id);
  }
}