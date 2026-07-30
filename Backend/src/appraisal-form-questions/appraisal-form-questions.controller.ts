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
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import { AppraisalFormQuestionsService } from './appraisal-form-questions.service';
import { CreateAppraisalFormQuestionDto } from './dto/create-appraisal-form-question.dto';
import { UpdateAppraisalFormQuestionDto } from './dto/update-appraisal-form-question.dto';
import { RequirePermission } from 'src/authorization/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/authorization/guards/permission.guard';

@ApiTags('Appraisal Form Questions')
@Controller('appraisal-form-questions')
export class AppraisalFormQuestionsController {
  constructor(
    private readonly appraisalFormQuestionsService: AppraisalFormQuestionsService,
  ) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-form-questions.create')
  @ApiOperation({ summary: 'Create a new appraisal form question' })
  @ApiHeader({
    name: 'user',
    description: 'Authenticated User ID',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: CreateAppraisalFormQuestionDto })
  @ApiResponse({
    status: 201,
    description: 'Appraisal form question created successfully.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data.',
  })
  create(
    @Body() createAppraisalFormQuestionDto: CreateAppraisalFormQuestionDto,
  ) {
    return this.appraisalFormQuestionsService.create(
      createAppraisalFormQuestionDto,
    );
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-form-questions.view')
  @ApiOperation({ summary: 'Get all appraisal form questions' })
  @ApiHeader({
    name: 'user',
    description: 'Authenticated User ID',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'List of appraisal form questions retrieved successfully.',
  })
  findAll() {
    return this.appraisalFormQuestionsService.findAll();
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-form-questions.view.own')
  @ApiOperation({ summary: 'Get an appraisal form question by ID' })
  @ApiHeader({
    name: 'user',
    description: 'Authenticated User ID',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Form Question ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal form question retrieved successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal form question not found.',
  })
  findOne(@Param('id') id: string) {
    return this.appraisalFormQuestionsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-form-questions.update')
  @ApiOperation({ summary: 'Update an appraisal form question' })
  @ApiHeader({
    name: 'user',
    description: 'Authenticated User ID',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Form Question ID',
    example: 1,
  })
  @ApiBody({ type: UpdateAppraisalFormQuestionDto })
  @ApiResponse({
    status: 200,
    description: 'Appraisal form question updated successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal form question not found.',
  })
  update(
    @Param('id') id: string,
    @Body() updateAppraisalFormQuestionDto: UpdateAppraisalFormQuestionDto,
  ) {
    return this.appraisalFormQuestionsService.update(
      +id,
      updateAppraisalFormQuestionDto,
    );
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-form-questions.delete')
  @ApiOperation({ summary: 'Delete an appraisal form question' })
  @ApiHeader({
    name: 'user',
    description: 'Authenticated User ID',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'id',
    description: 'Appraisal Form Question ID',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Appraisal form question deleted successfully.',
  })
  @ApiResponse({
    status: 404,
    description: 'Appraisal form question not found.',
  })
  remove(@Param('id') id: string) {
    return this.appraisalFormQuestionsService.remove(+id);
  }
}
