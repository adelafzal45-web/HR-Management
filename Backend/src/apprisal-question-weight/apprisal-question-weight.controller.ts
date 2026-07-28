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

import { AppraisalQuestionWeightsService } from './apprisal-question-weight.service';

import { CreateAppraisalQuestionWeightDto } from './dto/create.dto';

import { UpdateAppraisalQuestionWeightDto } from './dto/update.dto';

@ApiTags('Appraisal Question Weights')
@Controller('appraisal-question-weights')
export class AppraisalQuestionWeightsController {
  constructor(
    private readonly weightService: AppraisalQuestionWeightsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create an appraisal question weight',
    description:
      'Assigns a percentage weight to an appraisal question.',
  })
  @ApiBody({
    type: CreateAppraisalQuestionWeightDto,
  })
  @ApiResponse({
    status: 201,
    description:
      'Appraisal question weight created successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'The appraisal question already has a weight.',
  })
  create(
    @Body()
    dto: CreateAppraisalQuestionWeightDto,
  ) {
    return this.weightService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all appraisal question weights',
  })
  @ApiResponse({
    status: 200,
    description:
      'Returns all appraisal question weights.',
  })
  findAll() {
    return this.weightService.findAll();
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an appraisal question weight',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal question weight UUID',
    example:
      '7f8b9c12-1234-4567-8901-123456789abc',
  })
  @ApiResponse({
    status: 200,
    description:
      'Appraisal question weight found.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Appraisal question weight not found.',
  })
  findOne(@Param('id') id: string) {
    return this.weightService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update an appraisal question weight',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal question weight UUID',
  })
  @ApiBody({
    type: UpdateAppraisalQuestionWeightDto,
  })
  @ApiResponse({
    status: 200,
    description:
      'Appraisal question weight updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Appraisal question weight not found.',
  })
  @ApiResponse({
    status: 409,
    description:
      'The appraisal question already has a weight.',
  })
  update(
    @Param('id') id: string,
    @Body()
    dto: UpdateAppraisalQuestionWeightDto,
  ) {
    return this.weightService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete an appraisal question weight',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal question weight UUID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Appraisal question weight deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description:
      'Appraisal question weight not found.',
  })
  remove(@Param('id') id: string) {
    return this.weightService.remove(id);
  }
}