import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AppraisalQuestionService } from './appraisal-question.service';

import { CreateAppraisalQuestionDto } from './dto/create-appraisal-question.dto';
import { UpdateAppraisalQuestionDto } from './dto/update-appraisal-question.dto';

@ApiTags('Appraisal Questions')
@Controller('appraisal-questions')
export class AppraisalQuestionController {
  constructor(
    private readonly appraisalQuestionService: AppraisalQuestionService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create appraisal question',
    description:
      'Creates a new appraisal question for employee performance evaluation',
  })
  @ApiResponse({
    status: 201,
    description: 'Appraisal question created successfully',
  })
  create(@Body() createDto: CreateAppraisalQuestionDto) {
    return this.appraisalQuestionService.create(createDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all appraisal questions',
    description: 'Returns a list of all appraisal questions',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal questions fetched successfully',
  })
  findAll() {
    return this.appraisalQuestionService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get appraisal question by ID',
    description: 'Returns a single appraisal question using its ID',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Appraisal question UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question found successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found',
  })
  findOne(@Param('id') id: string) {
    return this.appraisalQuestionService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update appraisal question',
    description: 'Updates an existing appraisal question',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Appraisal question UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found',
  })
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateAppraisalQuestionDto,
  ) {
    return this.appraisalQuestionService.update(id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete appraisal question',
    description: 'Deletes an appraisal question using its ID',
  })
  @ApiParam({
    name: 'id',
    example: '8f9b8b2e-5a6a-4d9e-b4c1-123456789abc',
    description: 'Appraisal question UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found',
  })
  remove(@Param('id') id: string) {
    return this.appraisalQuestionService.remove(id);
  }
}
