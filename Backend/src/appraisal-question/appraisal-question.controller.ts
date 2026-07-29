import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AppraisalQuestionService } from './appraisal-question.service';
import { CreateAppraisalQuestionDto } from './dto/create-appraisal-question.dto';
import { UpdateAppraisalQuestionDto } from './dto/update-appraisal-question.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Appraisal Questions')
@Controller('appraisal-question')
export class AppraisalQuestionController {
  constructor(
    private readonly appraisalQuestionService: AppraisalQuestionService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
@RequirePermission('appraisal.create')
  @ApiOperation({
    summary: 'Create appraisal question',
    description: 'Creates a new appraisal question.',
  })
  @ApiBody({
    type: CreateAppraisalQuestionDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Appraisal question created successfully.',
  })
  create(@Body() createAppraisalQuestionDto: CreateAppraisalQuestionDto) {
    return this.appraisalQuestionService.create(createAppraisalQuestionDto);
  }

  @Get()
  @UseGuards(PermissionGuard)
@RequirePermission('appraisal.view')
  @ApiOperation({
    summary: 'Get all appraisal questions',
    description: 'Returns all appraisal questions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal questions fetched successfully.',
  })
  findAll() {
    return this.appraisalQuestionService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('appraisal.view')
  @ApiOperation({
    summary: 'Get appraisal question by ID',
    description: 'Returns a single appraisal question.',
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
  findOne(@Param('id') id: string) {
    return this.appraisalQuestionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('appraisal.update')
  @ApiOperation({
    summary: 'Update appraisal question',
    description: 'Updates an existing appraisal question.',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Question UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question updated successfully.',
  })
  update(
    @Param('id') id: string,
    @Body() updateAppraisalQuestionDto: UpdateAppraisalQuestionDto,
  ) {
    return this.appraisalQuestionService.update(id, updateAppraisalQuestionDto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
@RequirePermission('appraisal.delete')
  @ApiOperation({
    summary: 'Delete appraisal question',
    description: 'Deletes an appraisal question.',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Question UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question deleted successfully.',
  })
  remove(@Param('id') id: string) {
    return this.appraisalQuestionService.remove(id);
  }
}
