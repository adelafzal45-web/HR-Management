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

import { AppraisalQuestionOptionsService } from './apprisal-question-options.service';

import { CreateAppraisalQuestionOptionDto } from './dto/create.dto';

import { UpdateAppraisalQuestionOptionDto } from './dto/update.dto';
import { UseGuards } from '@nestjs/common';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Appraisal Question Options')
@Controller('appraisal-question-options')
export class AppraisalQuestionOptionsController {
  constructor(
    private readonly optionService: AppraisalQuestionOptionsService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('apprisal-question.create')
  @ApiOperation({
    summary: 'Create an appraisal question option',
    description: 'Creates a rating option for an appraisal question.',
  })
  @ApiBody({
    type: CreateAppraisalQuestionOptionDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Appraisal question option created successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question not found.',
  })
  create(
    @Body()
    dto: CreateAppraisalQuestionOptionDto,
  ) {
    return this.optionService.create(dto);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('apprisal-question.view')
  @ApiOperation({
    summary: 'Get all appraisal question options',
  })
  @ApiResponse({
    status: 200,
    description: 'Returns all appraisal question options.',
  })
  findAll() {
    return this.optionService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('apprisal-question.view.own')
  @ApiOperation({
    summary: 'Get an appraisal question option',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal question option UUID',
    example: '7f8b9c12-1234-4567-8901-123456789abc',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question option found.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question option not found.',
  })
  findOne(@Param('id') id: string) {
    return this.optionService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('apprisal-question.update')
  @ApiOperation({
    summary: 'Update an appraisal question option',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal question option UUID',
  })
  @ApiBody({
    type: UpdateAppraisalQuestionOptionDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question option updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question option not found.',
  })
  update(
    @Param('id') id: string,
    @Body()
    dto: UpdateAppraisalQuestionOptionDto,
  ) {
    return this.optionService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('apprisal-question.delete')
  @ApiOperation({
    summary: 'Delete an appraisal question option',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal question option UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal question option deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal question option not found.',
  })
  remove(@Param('id') id: string) {
    return this.optionService.remove(id);
  }
}
