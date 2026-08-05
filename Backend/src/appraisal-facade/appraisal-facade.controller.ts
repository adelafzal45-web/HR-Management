import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { AppraisalFacadeService } from './appraisal-facade.service';
import { AppraisalQuestionBankService } from './appraisal-question-bank.service';
import { AppraisalWorkflowService } from './appraisal-workflow.service';
import { AppraisalStatsService } from './appraisal-stats.service';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';
import { SaveFormQuestionsDto } from './dto/save-form-questions.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import {
  BankQuestionQueryDto,
  CreateBankQuestionDto,
  UpdateBankQuestionDto,
} from './dto/question-bank.dto';
import {
  CreateTeamLeadAssignmentDto,
  UpdateTeamLeadAssignmentMembersDto,
} from './dto/team-lead-assignment.dto';
import { WorkflowActionDto } from './dto/workflow-action.dto';
import { StatsQueryDto, CompareStatsQueryDto } from './dto/stats-query.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtUser } from '../auth/auth.constants';
import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { PermissionGuard } from '../authorization/guards/permission.guard';
import type { StatsViewer } from './appraisal-stats.service';

/**
 * The single HTTP surface for the appraisal workflow.
 *
 * Permissions map onto the three roles:
 *  - `appraisal-forms.*` and `appraisal.viewAll` → HR/Admin only
 *  - `appraisal.create` / `appraisal.view`       → Team Lead
 *  - `appraisal.viewOwn`                         → everyone, own record only
 *
 * Endpoints that return an employee's own data derive the employee id from the
 * JWT rather than a path param, so `viewOwn` cannot be pointed at someone else.
 */
@ApiTags('Appraisal')
@ApiBearerAuth()
@Controller('appraisal')
export class AppraisalFacadeController {
  constructor(
    private readonly appraisalFacadeService: AppraisalFacadeService,
    private readonly questionBankService: AppraisalQuestionBankService,
    private readonly workflowService: AppraisalWorkflowService,
    private readonly statsService: AppraisalStatsService,
  ) {}

  // ==========================================================================
  // FORMS — HR/Admin
  // ==========================================================================

  @Get('forms')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.view')
  @ApiOperation({ summary: 'List all appraisal forms' })
  @ApiResponse({ status: 200, description: 'Forms retrieved.' })
  listForms() {
    return this.appraisalFacadeService.listForms();
  }

  @Get('forms/:formId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.view')
  @ApiOperation({ summary: 'Get one form with its questions and assignments' })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiResponse({ status: 200, description: 'Form retrieved.' })
  @ApiResponse({ status: 404, description: 'Form not found.' })
  getForm(@Param('formId', ParseUUIDPipe) formId: string) {
    return this.appraisalFacadeService.getForm(formId);
  }

  @Post('forms')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.create')
  @ApiOperation({ summary: 'Create a draft appraisal form' })
  @ApiBody({ type: CreateFormDto })
  @ApiResponse({ status: 201, description: 'Form created as Draft.' })
  @ApiResponse({ status: 409, description: 'A form with that name exists.' })
  createForm(@CurrentUser() user: JwtUser, @Body() dto: CreateFormDto) {
    return this.appraisalFacadeService.createForm(user.user_id, dto);
  }

  @Put('forms/:formId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.update')
  @ApiOperation({ summary: "Update a form's name, description, or cadence" })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiBody({ type: UpdateFormDto })
  @ApiResponse({ status: 200, description: 'Form updated.' })
  @ApiResponse({ status: 400, description: 'Form is archived.' })
  updateForm(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: UpdateFormDto,
  ) {
    return this.appraisalFacadeService.updateForm(formId, dto);
  }

  @Post('forms/:formId/publish')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.update')
  @ApiOperation({
    summary: 'Publish a form (active question weights must total 100%)',
  })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiResponse({ status: 201, description: 'Form published.' })
  @ApiResponse({
    status: 400,
    description: 'Weights do not total 100%, or no active questions.',
  })
  publishForm(@Param('formId', ParseUUIDPipe) formId: string) {
    return this.appraisalFacadeService.publishForm(formId);
  }

  @Post('forms/:formId/duplicate')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.create')
  @ApiOperation({
    summary: 'Copy a form, its questions and its audience into a new Draft',
    description:
      'The copy links the same question bank rows but carries no publish snapshot, so it is fully editable. Named "<name> (Copy)".',
  })
  @ApiParam({ name: 'formId', description: 'Form UUID to copy' })
  @ApiResponse({ status: 201, description: 'Copy created as Draft.' })
  @ApiResponse({ status: 404, description: 'Source form not found.' })
  duplicateForm(
    @CurrentUser() user: JwtUser,
    @Param('formId', ParseUUIDPipe) formId: string,
  ) {
    return this.appraisalFacadeService.duplicateForm(formId, user.user_id);
  }

  @Delete('forms/:formId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.delete')
  @ApiOperation({
    summary: 'Delete a form, or archive it if evaluations reference it',
  })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiResponse({ status: 200, description: 'Form deleted or archived.' })
  deleteForm(@Param('formId', ParseUUIDPipe) formId: string) {
    return this.appraisalFacadeService.deleteForm(formId);
  }

  // ==========================================================================
  // QUESTIONS & WEIGHTS — HR/Admin
  // ==========================================================================

  @Put('forms/:formId/questions')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.update')
  @ApiOperation({
    summary: "Replace a draft form's questions, weights, and rating scales",
  })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiBody({ type: SaveFormQuestionsDto })
  @ApiResponse({ status: 200, description: 'Questions saved.' })
  @ApiResponse({
    status: 400,
    description: 'Form is not in Draft, or a question is invalid.',
  })
  saveFormQuestions(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: SaveFormQuestionsDto,
  ) {
    return this.appraisalFacadeService.saveFormQuestions(formId, dto);
  }

  // ==========================================================================
  // ASSIGNMENTS — HR/Admin
  // ==========================================================================

  @Get('forms/:formId/assignments')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.view')
  @ApiOperation({ summary: "List a form's assignment targets" })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiResponse({ status: 200, description: 'Assignments retrieved.' })
  listAssignments(@Param('formId', ParseUUIDPipe) formId: string) {
    return this.appraisalFacadeService.listAssignments(formId);
  }

  @Post('forms/:formId/assignments')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.assign')
  @ApiOperation({
    summary: 'Assign a form to a department, designation, or employee',
    description:
      'Works on Draft forms too — a Draft assignment is inert until publish, since only published forms are resolved for employees.',
  })
  @ApiParam({ name: 'formId', description: 'Form UUID' })
  @ApiBody({ type: CreateAssignmentDto })
  @ApiResponse({ status: 201, description: 'Assignment created.' })
  @ApiResponse({
    status: 400,
    description: 'Form is archived, or target count is not exactly one.',
  })
  @ApiResponse({ status: 409, description: 'Target is already assigned.' })
  createAssignment(
    @Param('formId', ParseUUIDPipe) formId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.appraisalFacadeService.createAssignment(formId, dto);
  }

  @Delete('assignments/:assignmentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.assign')
  @ApiOperation({ summary: 'Remove an assignment' })
  @ApiParam({ name: 'assignmentId', description: 'Assignment UUID' })
  @ApiResponse({ status: 200, description: 'Assignment removed.' })
  deleteAssignment(@Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return this.appraisalFacadeService.deleteAssignment(assignmentId);
  }

  // ==========================================================================
  // TEAM — Team Lead
  // ==========================================================================

  @Get('my-team')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({
    summary: "The reviewer's team with each member's assigned form and status",
  })
  @ApiResponse({ status: 200, description: 'Team retrieved.' })
  getMyTeam(@CurrentUser() user: JwtUser) {
    return this.appraisalFacadeService.getMyTeam(user.user_id);
  }

  @Get('my-team/stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({ summary: 'Completion rate and score spread for the team' })
  @ApiResponse({ status: 200, description: 'Stats retrieved.' })
  getTeamStats(@CurrentUser() user: JwtUser) {
    return this.appraisalFacadeService.getTeamStats(user.user_id);
  }

  // ==========================================================================
  // EVALUATION — Team Lead
  // ==========================================================================

  @Get('evaluate/:employeeId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({
    summary: "Resolve the employee's assigned form plus any prior submission",
  })
  @ApiParam({ name: 'employeeId', description: 'Employee (reviewee) UUID' })
  @ApiResponse({ status: 200, description: 'Evaluation form retrieved.' })
  @ApiResponse({ status: 403, description: 'Employee is not on your team.' })
  @ApiResponse({ status: 404, description: 'No published form assigned.' })
  getEvaluationForm(
    @CurrentUser() user: JwtUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
  ) {
    return this.appraisalFacadeService.getEvaluationForm(
      user.user_id,
      employeeId,
    );
  }

  @Post('evaluate/:employeeId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.create')
  @ApiOperation({ summary: 'Submit (or overwrite) an evaluation' })
  @ApiParam({ name: 'employeeId', description: 'Employee (reviewee) UUID' })
  @ApiBody({ type: SubmitEvaluationDto })
  @ApiResponse({ status: 201, description: 'Evaluation submitted.' })
  @ApiResponse({ status: 400, description: 'Validation failed.' })
  @ApiResponse({ status: 403, description: 'Employee is not on your team.' })
  submitEvaluation(
    @CurrentUser() user: JwtUser,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: SubmitEvaluationDto,
  ) {
    return this.appraisalFacadeService.submitEvaluation(
      user.user_id,
      employeeId,
      dto,
    );
  }

  // ==========================================================================
  // EMPLOYEE — own results only
  // ==========================================================================

  @Get('my-evaluations')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.viewOwn')
  @ApiOperation({
    summary:
      "The caller's own review history, category breakdown, and score trend",
  })
  @ApiResponse({ status: 200, description: 'Evaluations retrieved.' })
  getMyEvaluations(@CurrentUser() user: JwtUser) {
    // Employee id comes from the JWT, never a param — `viewOwn` cannot be
    // aimed at another employee.
    return this.appraisalFacadeService.getMyEvaluations(user.user_id);
  }

  // ==========================================================================
  // REPORTS — HR/Admin
  // ==========================================================================

  @Get('evaluations')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.viewAll')
  @ApiOperation({ summary: 'Every evaluation across the organisation' })
  @ApiResponse({ status: 200, description: 'Evaluations retrieved.' })
  getAllEvaluations() {
    return this.appraisalFacadeService.getAllEvaluations();
  }

  @Get('analytics')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.viewAll')
  @ApiOperation({
    summary:
      'Org-wide averages, distribution, and department/designation splits',
  })
  @ApiResponse({ status: 200, description: 'Analytics retrieved.' })
  getAnalytics() {
    return this.appraisalFacadeService.getAnalytics();
  }

  // ==========================================================================
  // QUESTION BANK — HR/Admin
  // ==========================================================================

  @Get('questions')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.questions.manage')
  @ApiOperation({ summary: 'List the reusable question bank' })
  @ApiResponse({ status: 200, description: 'Questions retrieved.' })
  listQuestions(@Query() query: BankQuestionQueryDto) {
    return this.questionBankService.list(query);
  }

  @Get('questions/:questionId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.questions.manage')
  @ApiOperation({ summary: 'Get one bank question with its options' })
  @ApiParam({ name: 'questionId', description: 'Question UUID' })
  @ApiResponse({ status: 200, description: 'Question retrieved.' })
  @ApiResponse({ status: 404, description: 'Question not found.' })
  getQuestion(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.questionBankService.findOne(questionId);
  }

  @Get('questions/:questionId/usage')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.questions.manage')
  @ApiOperation({ summary: 'Which forms reference this question' })
  @ApiParam({ name: 'questionId', description: 'Question UUID' })
  @ApiResponse({ status: 200, description: 'Usage retrieved.' })
  getQuestionUsage(@Param('questionId', ParseUUIDPipe) questionId: string) {
    return this.questionBankService.getUsage(questionId);
  }

  @Post('questions')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.questions.manage')
  @ApiOperation({ summary: 'Create a bank question' })
  @ApiBody({ type: CreateBankQuestionDto })
  @ApiResponse({ status: 201, description: 'Question created.' })
  createQuestion(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBankQuestionDto,
  ) {
    return this.questionBankService.create(dto, {
      user_id: user.user_id,
      email: user.email,
    });
  }

  @Put('questions/:questionId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.questions.manage')
  @ApiOperation({ summary: 'Update a bank question' })
  @ApiParam({ name: 'questionId', description: 'Question UUID' })
  @ApiBody({ type: UpdateBankQuestionDto })
  @ApiResponse({ status: 200, description: 'Question updated.' })
  updateQuestion(
    @CurrentUser() user: JwtUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
    @Body() dto: UpdateBankQuestionDto,
  ) {
    return this.questionBankService.update(questionId, dto, {
      user_id: user.user_id,
      email: user.email,
    });
  }

  @Delete('questions/:questionId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal-forms.questions.manage')
  @ApiOperation({ summary: 'Delete a bank question (or deactivate if in use)' })
  @ApiParam({ name: 'questionId', description: 'Question UUID' })
  @ApiResponse({ status: 200, description: 'Question deleted or deactivated.' })
  removeQuestion(
    @CurrentUser() user: JwtUser,
    @Param('questionId', ParseUUIDPipe) questionId: string,
  ) {
    return this.questionBankService.remove(questionId, {
      user_id: user.user_id,
      email: user.email,
    });
  }

  // ==========================================================================
  // TEAM LEAD ASSIGNMENTS — HR/Admin
  // ==========================================================================

  @Get('team-lead-assignments')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.teamlead.assign')
  @ApiOperation({ summary: 'List all Team Lead roster assignments' })
  @ApiQuery({
    name: 'teamLeadId',
    required: false,
    description: 'Filter by lead UUID',
  })
  @ApiResponse({ status: 200, description: 'Assignments retrieved.' })
  listTeamLeadAssignments(@Query('teamLeadId') teamLeadId?: string) {
    return this.appraisalFacadeService.listTeamLeadAssignments(teamLeadId);
  }

  @Post('team-lead-assignments')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.teamlead.assign')
  @ApiOperation({
    summary: 'Create a Team Lead assignment (DEPARTMENT or MEMBERS mode)',
  })
  @ApiBody({ type: CreateTeamLeadAssignmentDto })
  @ApiResponse({ status: 201, description: 'Assignment created.' })
  @ApiResponse({ status: 400, description: 'Invalid mode/field combination.' })
  @ApiResponse({
    status: 409,
    description: 'A department-wide assignment already exists for this lead.',
  })
  createTeamLeadAssignment(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateTeamLeadAssignmentDto,
  ) {
    return this.appraisalFacadeService.createTeamLeadAssignment(
      dto,
      user.user_id,
    );
  }

  @Put('team-lead-assignments/:assignmentId/members')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.teamlead.assign')
  @ApiOperation({
    summary: 'Replace the member list of a MEMBERS-mode assignment',
  })
  @ApiParam({ name: 'assignmentId', description: 'Assignment UUID' })
  @ApiBody({ type: UpdateTeamLeadAssignmentMembersDto })
  @ApiResponse({ status: 200, description: 'Members updated.' })
  @ApiResponse({
    status: 400,
    description: 'Assignment is not in MEMBERS mode.',
  })
  updateTeamLeadAssignmentMembers(
    @CurrentUser() user: JwtUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateTeamLeadAssignmentMembersDto,
  ) {
    return this.appraisalFacadeService.updateTeamLeadAssignmentMembers(
      assignmentId,
      dto,
      user.user_id,
    );
  }

  @Delete('team-lead-assignments/:assignmentId')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.teamlead.assign')
  @ApiOperation({ summary: 'Delete a Team Lead assignment' })
  @ApiParam({ name: 'assignmentId', description: 'Assignment UUID' })
  @ApiResponse({ status: 200, description: 'Assignment deleted.' })
  deleteTeamLeadAssignment(
    @CurrentUser() user: JwtUser,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.appraisalFacadeService.deleteTeamLeadAssignment(
      assignmentId,
      user.user_id,
    );
  }

  // ==========================================================================
  // WORKFLOW — HR/Admin (approve / reject / reopen)
  // ==========================================================================

  @Post('reviews/:reviewId/approve')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a submitted review' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiBody({ type: WorkflowActionDto })
  @ApiResponse({ status: 200, description: 'Review approved.' })
  @ApiResponse({
    status: 409,
    description: 'Review is not in Submitted status.',
  })
  approveReview(
    @CurrentUser() user: JwtUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: WorkflowActionDto,
  ) {
    return this.workflowService.approve(reviewId, dto, user.user_id);
  }

  @Post('reviews/:reviewId/reject')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a submitted review (comment required)' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiBody({ type: WorkflowActionDto })
  @ApiResponse({ status: 200, description: 'Review rejected.' })
  @ApiResponse({ status: 400, description: 'Comment is required.' })
  @ApiResponse({
    status: 409,
    description: 'Review is not in Submitted status.',
  })
  rejectReview(
    @CurrentUser() user: JwtUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: WorkflowActionDto,
  ) {
    return this.workflowService.reject(reviewId, dto, user.user_id);
  }

  @Post('reviews/:reviewId/reopen')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reopen a locked review for editing (comment required)',
  })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiBody({ type: WorkflowActionDto })
  @ApiResponse({ status: 200, description: 'Review reopened.' })
  @ApiResponse({ status: 400, description: 'Comment is required.' })
  @ApiResponse({
    status: 409,
    description: 'Review is not in a reopenable status.',
  })
  reopenReview(
    @CurrentUser() user: JwtUser,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() dto: WorkflowActionDto,
  ) {
    return this.workflowService.reopen(reviewId, dto, user.user_id);
  }

  @Get('reviews/:reviewId/approvals')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.approve')
  @ApiOperation({ summary: 'Full approval trail for one review, oldest first' })
  @ApiParam({ name: 'reviewId', description: 'Review UUID' })
  @ApiResponse({ status: 200, description: 'Approval trail retrieved.' })
  listApprovals(@Param('reviewId', ParseUUIDPipe) reviewId: string) {
    return this.workflowService.getApprovals(reviewId);
  }

  // ==========================================================================
  // STATS — HR/Admin + Team Lead (roster-scoped)
  // ==========================================================================

  @Get('stats')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.stats')
  @ApiOperation({ summary: 'Filtered stats summary, trend, and breakdowns' })
  @ApiResponse({ status: 200, description: 'Stats retrieved.' })
  getStats(@CurrentUser() user: JwtUser, @Query() query: StatsQueryDto) {
    return this.statsService.getStats(query, this.toViewer(user));
  }

  @Get('stats/export/excel')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.export')
  @ApiOperation({ summary: 'Export results table to .xlsx' })
  @ApiResponse({ status: 200, description: 'Excel file.' })
  async exportStatsExcel(
    @CurrentUser() user: JwtUser,
    @Query() query: StatsQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.statsService.exportResultsToExcel(
      query,
      this.toViewer(user),
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="appraisal-results.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ==========================================================================
  // RESULTS TABLE — HR/Admin + Team Lead (roster-scoped)
  // ==========================================================================

  @Get('results')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.stats')
  @ApiOperation({ summary: 'Paginated, sortable, filterable results table' })
  @ApiResponse({ status: 200, description: 'Results retrieved.' })
  getResults(@CurrentUser() user: JwtUser, @Query() query: StatsQueryDto) {
    return this.statsService.getResults(query, this.toViewer(user));
  }

  // ==========================================================================
  // COMPARE — HR/Admin only
  // ==========================================================================

  @Get('compare')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.compare')
  @ApiOperation({ summary: 'Side-by-side comparison of 2–6 employees' })
  @ApiResponse({ status: 200, description: 'Comparison retrieved.' })
  @ApiResponse({
    status: 400,
    description: 'Fewer than 2 or more than 6 employees.',
  })
  compareStats(
    @CurrentUser() user: JwtUser,
    @Query() query: CompareStatsQueryDto,
  ) {
    return this.statsService.compare(query, this.toViewer(user));
  }

  @Get('compare/export/excel')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.export')
  @ApiOperation({ summary: 'Export comparison to .xlsx' })
  @ApiResponse({ status: 200, description: 'Excel file.' })
  async exportCompareExcel(
    @CurrentUser() user: JwtUser,
    @Query() query: CompareStatsQueryDto,
    @Res() res: Response,
  ) {
    const buffer = await this.statsService.exportCompareToExcel(
      query,
      this.toViewer(user),
    );
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="appraisal-compare.xlsx"',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // ==========================================================================
  // NOTIFICATIONS — own only
  // ==========================================================================

  @Get('notifications')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.viewOwn')
  @ApiOperation({ summary: "The caller's unread appraisal notifications" })
  @ApiResponse({ status: 200, description: 'Notifications retrieved.' })
  getNotifications(@CurrentUser() user: JwtUser) {
    return this.appraisalFacadeService.getNotifications(user.user_id);
  }

  @Patch('notifications/:notificationId/read')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.viewOwn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiParam({ name: 'notificationId', description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Marked as read.' })
  markNotificationRead(
    @CurrentUser() user: JwtUser,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    return this.appraisalFacadeService.markNotificationRead(
      notificationId,
      user.user_id,
    );
  }

  // ==========================================================================
  // DASHBOARDS
  // ==========================================================================

  @Get('dashboard/team-lead')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.view')
  @ApiOperation({
    summary: 'Team Lead dashboard: counts + roster + pending alerts',
  })
  @ApiResponse({ status: 200, description: 'Dashboard retrieved.' })
  getTeamLeadDashboard(@CurrentUser() user: JwtUser) {
    return this.appraisalFacadeService.getTeamLeadDashboard(user.user_id);
  }

  @Get('dashboard/employee')
  @UseGuards(PermissionGuard)
  @RequirePermission('appraisal.viewOwn')
  @ApiOperation({ summary: 'Employee dashboard: own evaluations + trend' })
  @ApiResponse({ status: 200, description: 'Dashboard retrieved.' })
  getEmployeeDashboard(@CurrentUser() user: JwtUser) {
    return this.appraisalFacadeService.getMyEvaluations(user.user_id);
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Maps the JWT role to a `StatsViewer` scope.
   *
   * The role string comes from the JWT, which is signed by the server, so it
   * cannot be spoofed by the caller. HR Manager / HR Admin / Admin see
   * everything; Team Lead sees their roster; everyone else sees only themselves.
   */
  private toViewer(user: JwtUser): StatsViewer {
    const role = user.role ?? '';
    if (['Admin', 'HR Manager', 'HR Admin'].includes(role)) {
      return { userId: user.user_id, scope: 'all' };
    }
    if (role === 'Team Lead') {
      return { userId: user.user_id, scope: 'team' };
    }
    return { userId: user.user_id, scope: 'self' };
  }
}
