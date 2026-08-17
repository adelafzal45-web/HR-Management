import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';

import { User } from '../users/user.entity';
import {
  AppraisalForms,
  FormStatus,
} from '../appraisal-forms/appraisal-forms.entity';
import { AppraisalFormAssignment } from '../appraisal-forms/appraisal-form-assignment.entity';
import { AppraisalFormResolverService } from '../appraisal-forms/appraisal-form-resolver.service';
import {
  TeamLeadAssignment,
  TeamLeadAssignmentMember,
  TeamLeadAssignmentMode,
} from '../appraisal-forms/team-lead-assignment.entity';
import {
  AppraisalQuestion,
  OPTION_BASED_TYPES,
  QuestionType,
} from '../appraisal-question/appraisal-question.entity';
import { AppraisalQuestionBankService } from './appraisal-question-bank.service';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { LOCKED_REVIEW_STATUSES } from '../performance-review/performance-review.constants';
import { isUniqueViolation } from '../common/typeorm-errors';
import {
  ReviewApproval,
  ReviewApprovalAction,
} from '../performance-review/review-approval.entity';
import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';
import { PerformanceReviewService } from '../performance-review/performance-review.service';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';
import { AppraisalNotification } from '../appraisal-notifications/appraisal-notification.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { Department } from '../department/department.entity';
import { Designation } from '../designation/designation.entity';

import { escapeLikeTerm } from '../common/dto/settings-list-query.dto';
import { CreateFormDto, UpdateFormDto } from './dto/form.dto';
import { FormListResult, FormQueryDto } from './dto/form-query.dto';
import { ChangeFormStatusDto } from './dto/change-form-status.dto';
import { SaveFormQuestionsDto } from './dto/save-form-questions.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitEvaluationDto } from './dto/submit-evaluation.dto';
import {
  CreateTeamLeadAssignmentDto,
  UpdateTeamLeadAssignmentMembersDto,
} from './dto/team-lead-assignment.dto';
import { cadenceFor } from './evaluation-cadence';

// ---------------------------------------------------------------------------
// Frontend-facing shapes (camelCase).
// ---------------------------------------------------------------------------

export interface FormQuestionOptionDto {
  optionId: string;
  optionText: string;
  score: number;
  displayOrder: number;
}

export interface FormQuestionDto {
  /** This form's link id (`form_question_id`) — what answers are keyed on. */
  questionId: string;
  /** The reusable bank row behind the link, for the "used on N forms" view. */
  bankQuestionId: string;
  questionText: string;
  questionType: QuestionType;
  /** Optional helper text under the title. Per form link, not per bank row. */
  description: string | null;
  weightage: number;
  isActive: boolean;
  ratingScale: number;
  /** Lower bound of the rating scale — 0 or 1. Always 1 for non-rating types. */
  ratingMin: number;
  minLabel: string | null;
  maxLabel: string | null;
  displayOrder: number;
  isRequired: boolean;
  /** Empty for `rating` and `text_feedback`. */
  options: FormQuestionOptionDto[];
  /**
   * True when this link is reading its frozen publish-time copy rather than the
   * live bank. Surfaced so the builder can show why an edit had no effect here.
   */
  isSnapshotted: boolean;
}

export interface AssignmentDto {
  assignmentId: string;
  formId: string;
  targetType: 'department' | 'designation' | 'employee';
  targetId: string;
  targetName: string;
}

export interface TeamLeadAssignmentMemberDto {
  employeeId: string;
  employeeCode: string;
  name: string;
  email: string;
}

export interface TeamLeadAssignmentDto {
  assignmentId: string;
  teamLeadId: string;
  teamLeadName: string;
  teamLeadEmail: string;
  mode: TeamLeadAssignmentMode;
  /** Set for DEPARTMENT mode only. */
  departmentId: string | null;
  departmentName: string | null;
  /** Populated for MEMBERS mode; empty for DEPARTMENT mode. */
  members: TeamLeadAssignmentMemberDto[];
  /** null for DEPARTMENT mode, where the count is "however many are in it today". */
  memberCount: number | null;
  createdAt: string;
}

export interface FormDto {
  formId: string;
  formName: string;
  description: string;
  evaluationType: string;
  status: string;
  isActive: boolean;
  questionCount: number;
  activeWeightTotal: number;
  assignmentCount: number;
  /**
   * Department and designation names this form applies to, de-duplicated and
   * sorted. Per-employee assignments are deliberately excluded — the forms list
   * shows the audience as an org rule, and a list of individual names there
   * would grow without bound.
   */
  departmentNames: string[];
  designationNames: string[];
  reviewCount: number;
  /**
   * Which revision of this form is current. Starts at 1 and is bumped by
   * `createFormVersion`, which is how a published form is reopened for editing
   * without disturbing the reviews already scored against the old questions.
   */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** One entry in a form's revision history. */
export interface FormVersionDto {
  version: number;
  /** True for the version the form is on now — the one edits and publishes hit. */
  isCurrent: boolean;
  /** Active question links recorded against this version. */
  questionCount: number;
  /** Reviews submitted while this version was current. */
  reviewCount: number;
}

export interface FormDetailDto extends FormDto {
  questions: FormQuestionDto[];
  assignments: AssignmentDto[];
}

export interface TeamMemberDto {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  designation: string;
  department: string;
  joiningDate: string;
  status: 'Active' | 'On Leave' | 'Inactive';
  avatarUrl?: string;
  avatarThumbUrl?: string;
  /** Resolved published form for this employee, or null if none applies. */
  assignedFormId: string | null;
  assignedFormName: string | null;
  evaluationStatus: 'Pending' | 'Completed' | 'Unassigned';
  lastReviewedAt: string | null;
  lastScore: number | null;
}

export interface EvaluationScoreDto {
  scoreId: string;
  questionId: string;
  criteriaName: string;
  questionType: QuestionType;
  weightage: number;
  ratingScale: number;
  /** Lower bound of the rating scale — 0 or 1. Always 1 for non-rating types. */
  ratingMin: number;
  /** Raw rating on the question's own scale. Always 0 for non-rating types. */
  score: number;
  /** Normalised 0–100, which is what aggregates are computed from. */
  scorePercentage: number;
  /** Option-based answers only. */
  selectedOptionId: string | null;
  selectedOptionText: string | null;
  remarks: string | null;
}

export interface SubmittedEvaluationDto {
  appraisalId: string;
  employeeId: string;
  employeeName: string;
  formId: string;
  formName: string;
  /**
   * The form's Daily / Weekly / Monthly cadence. Carried so the employee's own
   * history can be filtered by cadence without a second lookup per row — the
   * form relation is already loaded everywhere this DTO is built.
   */
  evaluationType: string;
  reviewerName: string;
  reviewDate: string;
  reviewPeriod: string;
  /** Weighted aggregate, 0–100. */
  totalScore: number;
  comments: string;
  recommendation: string;
  status: string;
  scores: EvaluationScoreDto[];
}

export interface EvaluationFormDto {
  employeeId: string;
  employeeName: string;
  formId: string;
  formName: string;
  evaluationType: string;
  /**
   * The period this submission belongs to, as the cadence names it — "2026-08-04"
   * for Daily, "2026-W32" for Weekly, "2026-08" for Monthly.
   *
   * Sent because the client must not invent it. `review_period` is part of
   * `UQ_pr_reviewee_form_period` and is how `submitEvaluation` finds the row the
   * scheduler already generated. A client-side label that disagrees with
   * `cadence.periodKey` silently creates a second review and leaves the
   * scheduler's Draft pending forever.
   */
  reviewPeriod: string;
  questions: FormQuestionDto[];
  existing: SubmittedEvaluationDto | null;
}

export interface TeamStatsDto {
  teamSize: number;
  evaluated: number;
  pending: number;
  completionRate: number;
  averageScore: number | null;
  distribution: Array<{ band: string; count: number }>;
}

export interface MyEvaluationsDto {
  evaluations: SubmittedEvaluationDto[];
  latestScore: number | null;
  averageScore: number | null;
  trend: Array<{ period: string; score: number; reviewDate: string }>;
  categoryBreakdown: Array<{
    criteriaName: string;
    averageScore: number;
    weightage: number;
  }>;
}

export interface AnalyticsDto {
  totalEvaluations: number;
  employeesEvaluated: number;
  averageScore: number | null;
  distribution: Array<{ band: string; count: number }>;
  byDepartment: Array<{ name: string; averageScore: number; count: number }>;
  byDesignation: Array<{ name: string; averageScore: number; count: number }>;
  trend: Array<{ period: string; averageScore: number; count: number }>;
}

/**
 * Ceiling on rows in a forms .xlsx export.
 *
 * Each row costs three related queries in `toFormDto`, so an unbounded export
 * of a large form catalogue is a slow request that holds a connection open.
 * Mirrors `MAX_EXPORT_ROWS` in the stats service, at a lower bound because
 * forms number in the hundreds where reviews number in the thousands.
 */
const MAX_FORM_EXPORT_ROWS = 1000;

/** A validated answer, normalised onto 0–100 before anything is persisted. */
interface ResolvedAnswer {
  percentage: number;
  /**
   * The chosen option, for provenance. Resolved against the live option table at
   * write time rather than trusted from here: a published form validates against
   * its frozen snapshot, and that snapshot can name an option HR has since
   * deleted from the bank. The percentage is already computed by then, so a
   * missing row costs the reference, not the score.
   */
  selectedOptionId?: string;
  comment?: string;
}

/** Score bands used by every distribution chart. */
const SCORE_BANDS: Array<{ band: string; min: number; max: number }> = [
  { band: '0–39', min: 0, max: 39.999 },
  { band: '40–59', min: 40, max: 59.999 },
  { band: '60–74', min: 60, max: 74.999 },
  { band: '75–89', min: 75, max: 89.999 },
  { band: '90–100', min: 90, max: 100 },
];

@Injectable()
export class AppraisalFacadeService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(AppraisalForms)
    private readonly formRepository: Repository<AppraisalForms>,

    @InjectRepository(AppraisalFormQuestion)
    private readonly formQuestionRepository: Repository<AppraisalFormQuestion>,

    @InjectRepository(AppraisalFormAssignment)
    private readonly assignmentRepository: Repository<AppraisalFormAssignment>,

    private readonly performanceReviewService: PerformanceReviewService,

    private readonly formResolver: AppraisalFormResolverService,

    private readonly questionBank: AppraisalQuestionBankService,

    private readonly audit: AuditService,

    private readonly authorization: AuthorizationService,
  ) {}

  /** Wording for error messages — snapshot first, since that is what the reviewer sees. */
  private questionLabel(fq: AppraisalFormQuestion): string {
    return (
      fq.snapshot_text || fq.question?.question_text || fq.form_question_id
    );
  }

  /** The type in force for this link: the frozen one if published, else live. */
  private linkType(fq: AppraisalFormQuestion): QuestionType {
    if (fq.snapshot_text) {
      return fq.snapshot_type ?? QuestionType.RATING;
    }
    return fq.question?.question_type ?? QuestionType.RATING;
  }

  /**
   * Turns one submitted answer into a 0–100 percentage, branching on the
   * question's type.
   *
   * Option scores are normalised against the highest-scoring option on the same
   * question rather than taken literally, so HR can write Yes = 10 / No = 0 or
   * Yes = 1 / No = 0 and both mean 100% / 0%. Without that, the option scores
   * would have to be authored as percentages, and a question whose best option
   * was worth 5 would cap that criterion at 5% of its weight with nothing on
   * screen explaining why.
   */
  private resolveAnswer(
    fq: AppraisalFormQuestion,
    input: SubmitEvaluationDto['scores'][number],
  ): ResolvedAnswer {
    const type = this.linkType(fq);
    const label = this.questionLabel(fq);

    if (type === QuestionType.TEXT_FEEDBACK) {
      // Unscored by definition. Weight is already forced to 0 at publish, and
      // recalculateReviewScore skips weight <= 0, so this contributes nothing to
      // the total no matter what percentage is stored.
      return { percentage: 0, comment: input.remarks };
    }

    if (type === QuestionType.RATING) {
      if (input.selectedOptionId) {
        throw new BadRequestException(
          `"${label}" is a rating question — send a score, not selectedOptionId.`,
        );
      }
      if (input.score === undefined || input.score === null) {
        throw new BadRequestException(`"${label}" needs a score.`);
      }
      const scale = fq.rating_scale ?? 10;
      const min = fq.rating_min ?? 1;
      if (input.score < min || input.score > scale) {
        throw new BadRequestException(
          `Score for "${label}" must be between ${min} and ${scale}.`,
        );
      }
      return {
        percentage: this.roundTo2((input.score / scale) * 100),
        comment: input.remarks,
      };
    }

    // Option-based: yes_no, multiple_choice, dropdown.
    if (!input.selectedOptionId) {
      throw new BadRequestException(
        `"${label}" is a ${type} question — send selectedOptionId.`,
      );
    }

    // Read the option set from wherever this link's truth lives, so a published
    // form still validates against the option list the reviewer was shown even
    // if the bank question has been edited since.
    const optionSet = fq.snapshot_text
      ? (fq.snapshot_options ?? []).map((option) => ({
          id: option.optionId,
          score: Number(option.score),
        }))
      : (fq.question?.options ?? []).map((option) => ({
          id: option.option_id,
          score: Number(option.score),
        }));

    const chosen = optionSet.find(
      (option) => option.id === input.selectedOptionId,
    );
    if (!chosen) {
      throw new BadRequestException(
        `Option ${input.selectedOptionId} does not belong to "${label}".`,
      );
    }

    const maxScore = Math.max(...optionSet.map((option) => option.score));
    if (!(maxScore > 0)) {
      throw new BadRequestException(
        `"${label}" has no option worth more than zero, so it cannot be scored.`,
      );
    }

    return {
      percentage: this.roundTo2((chosen.score / maxScore) * 100),
      selectedOptionId: input.selectedOptionId,
      comment: input.remarks,
    };
  }

  /**
   * Is this question live on this form.
   *
   * A published link answers from its own flag, because the bank row may have
   * been archived since the freeze and dropping the question at that point would
   * silently break a form whose weights already total 100%. A Draft link also
   * needs the bank row to still be on offer.
   */
  private isLinkActive(fq: AppraisalFormQuestion): boolean {
    if (fq.is_active === false) return false;
    if (fq.snapshot_text) return true;
    return fq.question?.is_active ?? true;
  }

  // ==========================================================================
  // FORMS — HR/Admin
  // ==========================================================================

  /**
   * The forms list, filtered / sorted / paged in the database.
   *
   * Only the requested page is projected into DTOs. `toFormDto` runs three
   * related queries per form, so projecting the whole table to satisfy a
   * 10-row page was the dominant cost on this screen.
   *
   * `questionCount` and `reviewCount` are not columns, so they sort through
   * correlated subqueries. Only active links are counted, matching the
   * `questionCount` the DTO reports.
   */
  async listForms(query: FormQueryDto): Promise<FormListResult<FormDto>> {
    const qb = this.formRepository.createQueryBuilder('form');

    const term = query.search?.trim();
    if (term) {
      // ILIKE for case-insensitive matching on Postgres; the term is escaped so
      // a typed `%` or `_` matches itself rather than everything.
      const pattern = `%${escapeLikeTerm(term)}%`;
      qb.andWhere(
        '(form.form_name ILIKE :pattern OR form.description ILIKE :pattern)',
        { pattern },
      );
    }

    if (query.status) {
      qb.andWhere('form.status = :status', { status: query.status });
    }

    if (query.evaluationType) {
      qb.andWhere('form.evaluation_type = :evaluationType', {
        evaluationType: query.evaluationType,
      });
    }

    /*
     * Audience filters are EXISTS rather than joins: a form assigned to three
     * departments would otherwise return three rows and corrupt both the page
     * size and `total`.
     */
    if (query.departmentId) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM appraisal_form_assignments afa
           WHERE afa.form_id = form.form_id
             AND afa.department_id = :departmentId
         )`,
        { departmentId: query.departmentId },
      );
    }

    if (query.designationId) {
      qb.andWhere(
        `EXISTS (
           SELECT 1 FROM appraisal_form_assignments afa
           WHERE afa.form_id = form.form_id
             AND afa.designation_id = :designationId
         )`,
        { designationId: query.designationId },
      );
    }

    const direction = query.order;

    switch (query.sortBy) {
      case 'formName':
        qb.orderBy('LOWER(form.form_name)', direction);
        break;
      case 'evaluationType':
        qb.orderBy('form.evaluation_type', direction);
        break;
      case 'status':
        qb.orderBy('form.status', direction);
        break;
      case 'questionCount':
        qb.addSelect(
          `(SELECT COUNT(*) FROM appraisal_form_questions afq
             WHERE afq.form_id = form.form_id AND afq.is_active = true)`,
          'question_count',
        ).orderBy('question_count', direction);
        break;
      case 'activeWeightTotal':
        /*
         * COALESCE, not a bare SUM: a form with no active questions sums to
         * NULL, and NULLs sort to one end regardless of direction — those forms
         * would sit above 100% forms on an ascending sort. The DTO reports 0 for
         * them, so 0 is what we order by.
         */
        qb.addSelect(
          `(SELECT COALESCE(SUM(afq.weight_percentage), 0)
              FROM appraisal_form_questions afq
             WHERE afq.form_id = form.form_id AND afq.is_active = true)`,
          'weight_total',
        ).orderBy('weight_total', direction);
        break;
      case 'reviewCount':
        qb.addSelect(
          `(SELECT COUNT(*) FROM performance_reviews pr
             WHERE pr.form_id = form.form_id)`,
          'review_count',
        ).orderBy('review_count', direction);
        break;
      case 'createdAt':
        qb.orderBy('form.created_at', direction);
        break;
      default:
        qb.orderBy('form.updated_at', direction);
    }

    // Ties on a non-unique key (status, evaluation type) would otherwise order
    // arbitrarily, letting a row appear on two pages or on none.
    qb.addOrderBy('form.form_id', 'ASC');

    const pageSize = query.pageSize;
    const page = query.page;

    const [forms, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      data: await Promise.all(forms.map((form) => this.toFormDto(form))),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * The forms list as .xlsx.
   *
   * Applies the caller's filters but ignores `page` / `pageSize`: an export of
   * "page 2 of 5" is a bug report waiting to happen. Capped at
   * `MAX_FORM_EXPORT_ROWS`, with a note written into the sheet when the cap is
   * hit so a truncated file cannot be mistaken for a complete one.
   */
  async exportFormsToExcel(query: FormQueryDto): Promise<Buffer> {
    /*
     * A real DTO instance, not a spread literal: `order` is a prototype getter
     * and would be lost by `{ ...query }`, silently flipping every export back
     * to descending.
     */
    const exportQuery = Object.assign(new FormQueryDto(), query, {
      page: 1,
      pageSize: MAX_FORM_EXPORT_ROWS,
    });

    const all = await this.listForms(exportQuery);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HRMS';
    const sheet = workbook.addWorksheet('Evaluation Forms');

    sheet.columns = [
      { header: 'Form Name', key: 'formName', width: 32 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Schedule', key: 'evaluationType', width: 14 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Active', key: 'isActive', width: 9 },
      { header: 'Departments', key: 'departments', width: 30 },
      { header: 'Designations', key: 'designations', width: 30 },
      { header: 'Questions', key: 'questionCount', width: 11 },
      { header: 'Weight %', key: 'activeWeightTotal', width: 11 },
      { header: 'Evaluations', key: 'reviewCount', width: 12 },
      { header: 'Created', key: 'createdAt', width: 14 },
      { header: 'Updated', key: 'updatedAt', width: 14 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const form of all.data) {
      sheet.addRow({
        formName: form.formName,
        description: form.description,
        evaluationType: form.evaluationType,
        status: form.status,
        isActive: form.isActive ? 'Yes' : 'No',
        // Joined rather than one row per audience entry: the sheet mirrors the
        // table, where a form is one row regardless of how broadly it applies.
        departments: form.departmentNames.join(', ') || '—',
        designations: form.designationNames.join(', ') || '—',
        questionCount: form.questionCount,
        activeWeightTotal: form.activeWeightTotal,
        reviewCount: form.reviewCount,
        createdAt: form.createdAt,
        updatedAt: form.updatedAt,
      });
    }

    sheet.getColumn('activeWeightTotal').numFmt = '0.00';

    if (all.total > all.data.length) {
      const note = sheet.addRow({});
      note.getCell(1).value =
        `Truncated: showing ${all.data.length} of ${all.total} matching forms. Narrow the filters to export the rest.`;
      note.font = { italic: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  async getForm(formId: string): Promise<FormDetailDto> {
    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    const [base, questions, assignments] = await Promise.all([
      this.toFormDto(form),
      this.loadFormQuestions(this.formQuestionRepository.manager, formId),
      this.listAssignments(formId),
    ]);

    return {
      ...base,
      questions: questions.map((fq) => this.toFormQuestion(fq)),
      assignments,
    };
  }

  async createForm(creatorId: string, dto: CreateFormDto): Promise<FormDto> {
    const duplicate = await this.formRepository.findOne({
      where: { form_name: dto.formName.trim() },
    });
    if (duplicate) {
      throw new ConflictException(
        `A form named "${dto.formName.trim()}" already exists.`,
      );
    }

    const creator = await this.userRepository.findOne({
      where: { user_id: creatorId },
    });

    const saved = await this.dataSource.transaction(async (manager) => {
      const form = await manager.getRepository(AppraisalForms).save(
        manager.getRepository(AppraisalForms).create({
          form_name: dto.formName.trim(),
          description: dto.description?.trim(),
          evaluation_type: dto.evaluationType,
          status: FormStatus.DRAFT,
          is_active: true,
          createdBy: creator ?? undefined,
        }),
      );

      await this.syncFormAudience(manager, form, dto);
      return form;
    });

    return this.toFormDto(saved);
  }

  async updateForm(formId: string, dto: UpdateFormDto): Promise<FormDto> {
    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    if (form.status === FormStatus.ARCHIVED) {
      throw new BadRequestException('An archived form cannot be edited.');
    }

    if (dto.formName !== undefined) {
      const name = dto.formName.trim();
      const duplicate = await this.formRepository.findOne({
        where: { form_name: name },
      });
      if (duplicate && duplicate.form_id !== formId) {
        throw new ConflictException(`A form named "${name}" already exists.`);
      }
      form.form_name = name;
    }

    if (dto.description !== undefined) {
      form.description = dto.description.trim();
    }

    if (dto.evaluationType !== undefined) {
      form.evaluation_type = dto.evaluationType;
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const updated = await manager.getRepository(AppraisalForms).save(form);
      await this.syncFormAudience(manager, updated, dto);
      return updated;
    });

    return this.toFormDto(saved);
  }

  /**
   * Replaces a form's department and/or designation assignments to match the
   * arrays on the DTO, so the whole audience can be set in the same request
   * that creates or renames the form.
   *
   * Replace-the-set rather than add-to-the-set, because the caller is a
   * multi-select: unticking a department has to mean something. Only the target
   * types actually present on the DTO are touched — an omitted array leaves its
   * rows alone, which keeps a partial update (rename only) from silently
   * clearing the audience.
   *
   * Per-employee assignments are never touched here. They outrank both tiers in
   * `resolveFormForEmployee`, and dropping an individual override as a
   * side-effect of editing the form name would be invisible from this screen.
   */
  private async syncFormAudience(
    manager: EntityManager,
    form: AppraisalForms,
    dto: Pick<CreateFormDto, 'departmentIds' | 'designationIds'>,
  ): Promise<void> {
    const repo = manager.getRepository(AppraisalFormAssignment);

    if (dto.departmentIds !== undefined) {
      const wanted = [...new Set(dto.departmentIds)];

      const departments = wanted.length
        ? await manager.getRepository(Department).find({
            where: { department_id: In(wanted) },
          })
        : [];
      if (departments.length !== wanted.length) {
        throw new NotFoundException(
          'One or more of the selected departments no longer exists.',
        );
      }

      // Delete-then-insert rather than diffing. The rows carry nothing but the
      // target and a timestamp, and `resolveFormForEmployee` breaks ties on
      // `created_at` — so a rewrite is not just simpler, it correctly makes this
      // save the newest assignment.
      await repo
        .createQueryBuilder()
        .delete()
        .where('form_id = :formId', { formId: form.form_id })
        .andWhere('department_id IS NOT NULL')
        .execute();

      for (const department of departments) {
        await repo.save(repo.create({ form, department }));
      }
    }

    if (dto.designationIds !== undefined) {
      const wanted = [...new Set(dto.designationIds)];

      const designations = wanted.length
        ? await manager.getRepository(Designation).find({
            where: { designation_id: In(wanted) },
          })
        : [];
      if (designations.length !== wanted.length) {
        throw new NotFoundException(
          'One or more of the selected designations no longer exists.',
        );
      }

      await repo
        .createQueryBuilder()
        .delete()
        .where('form_id = :formId', { formId: form.form_id })
        .andWhere('designation_id IS NOT NULL')
        .execute();

      for (const designation of designations) {
        await repo.save(repo.create({ form, designation }));
      }
    }
  }

  /**
   * Copies a form, its questions and its audience into a fresh Draft.
   *
   * The copy links to the same bank questions rather than cloning them — that
   * is the point of a shared bank, and cloning would double every question in
   * it after a few duplications. What is deliberately NOT copied is the publish
   * snapshot: the new form is a Draft, and a Draft must read the live bank or
   * the builder would show frozen wording nobody can edit.
   *
   * Per-employee assignments are left behind for the same reason they are not
   * settable from the form editor — an individual override is about a person,
   * not about the form, and silently duplicating it would reassign someone.
   */
  async duplicateForm(formId: string, creatorId: string): Promise<FormDto> {
    const source = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!source) {
      throw new NotFoundException('Appraisal form not found');
    }

    const [questions, assignments, creator] = await Promise.all([
      this.loadFormQuestions(this.formQuestionRepository.manager, formId),
      this.assignmentRepository.find({
        where: { form: { form_id: formId } },
        relations: { department: true, designation: true },
      }),
      this.userRepository.findOne({ where: { user_id: creatorId } }),
    ]);

    const name = await this.nextCopyName(source.form_name);

    const copy = await this.dataSource.transaction(async (manager) => {
      const formRepo = manager.getRepository(AppraisalForms);
      const linkRepo = manager.getRepository(AppraisalFormQuestion);
      const assignmentRepo = manager.getRepository(AppraisalFormAssignment);

      const created = await formRepo.save(
        formRepo.create({
          form_name: name,
          description: source.description,
          evaluation_type: source.evaluation_type,
          status: FormStatus.DRAFT,
          is_active: true,
          createdBy: creator ?? undefined,
        }),
      );

      for (const fq of questions) {
        await linkRepo.save(
          linkRepo.create({
            appraisalForm: created,
            question: fq.question,
            // A copy starts its own history at version 1 regardless of how many
            // revisions the source went through — the source's versions describe
            // the source's reviews, and this form has none.
            version: 1,
            display_order: fq.display_order,
            weight_percentage: fq.weight_percentage,
            is_required: fq.is_required,
            is_active: fq.is_active,
            description: fq.description ?? null,
            rating_scale: fq.rating_scale,
            rating_min: fq.rating_min,
            min_label: fq.min_label ?? null,
            max_label: fq.max_label ?? null,
          }),
        );
      }

      for (const assignment of assignments) {
        if (!assignment.department && !assignment.designation) continue;
        await assignmentRepo.save(
          assignmentRepo.create({
            form: created,
            department: assignment.department ?? null,
            designation: assignment.designation ?? null,
          }),
        );
      }

      return created;
    });

    return this.toFormDto(copy);
  }

  /**
   * Opens a published form for editing by starting a new version of it.
   *
   * The alternative — letting the questions be edited in place — is what the
   * publish snapshot exists to prevent: reviews are scored against frozen
   * wording and weights, and rewriting those would silently change what an
   * already-submitted score meant. Duplicating is the other escape hatch, but a
   * duplicate is a *different* form: it needs a new name, it does not inherit
   * the original's history, and the audience has to be reassigned.
   *
   * A version keeps the form's identity. The previous version's link rows are
   * left exactly as they are, so `performance_review_answers.form_question_id`
   * still resolves to the question each answer was given against; the new
   * version gets its own copies to edit. Nothing about existing reviews moves.
   *
   * The form drops back to Draft for the duration. That is deliberate: a form
   * mid-rework is not one reviewers should be scoring against, and
   * `resolveFormForEmployee` only picks Published rows. Publishing again
   * snapshots the new version and makes it the one new reviews use.
   */
  async createFormVersion(formId: string, actorId: string): Promise<FormDto> {
    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    if (form.status === FormStatus.ARCHIVED) {
      throw new BadRequestException(
        'Restore this form from the archive before starting a new version.',
      );
    }

    // A Draft is already editable in place. Versioning it would leave an empty
    // version behind and imply a history that never existed.
    if (form.status === FormStatus.DRAFT) {
      throw new BadRequestException(
        'This form is already a Draft — edit its questions directly.',
      );
    }

    const currentVersion = form.version ?? 1;
    const nextVersion = currentVersion + 1;

    const current = await this.loadFormQuestions(
      this.formQuestionRepository.manager,
      formId,
      currentVersion,
    );

    await this.dataSource.transaction(async (manager) => {
      const formRepo = manager.getRepository(AppraisalForms);
      const linkRepo = manager.getRepository(AppraisalFormQuestion);

      for (const fq of current) {
        await linkRepo.save(
          linkRepo.create({
            appraisalForm: form,
            question: fq.question,
            version: nextVersion,
            display_order: fq.display_order,
            weight_percentage: fq.weight_percentage,
            is_required: fq.is_required,
            is_active: fq.is_active,
            description: fq.description ?? null,
            rating_scale: fq.rating_scale,
            rating_min: fq.rating_min,
            min_label: fq.min_label ?? null,
            max_label: fq.max_label ?? null,
            /*
             * Snapshots are deliberately not carried over. The new version is a
             * Draft, and a Draft reads the live bank — copying the freeze would
             * show the builder wording it cannot edit, which is the exact
             * confusion `saveFormQuestions` clears these columns to avoid.
             */
            snapshot_text: null,
            snapshot_type: null,
            snapshot_description: null,
            snapshot_options: null,
          }),
        );
      }

      form.version = nextVersion;
      form.status = FormStatus.DRAFT;
      await formRepo.save(form);
    });

    await this.audit.record({
      actor: { user_id: actorId },
      action: 'appraisal.form.version',
      entityType: 'appraisal_forms',
      entityId: formId,
      before: { version: currentVersion, status: FormStatus.PUBLISHED },
      after: { version: nextVersion, status: FormStatus.DRAFT },
    });

    const fresh = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    return this.toFormDto(fresh ?? form);
  }

  /**
   * The version history of one form: how many questions each version carried and
   * how many reviews were scored against it.
   *
   * Review counts come from `performance_reviews.form_version`, which is stamped
   * at submission. Reviews predating versioning have a NULL there and are
   * counted as version 1 — that is what the migration backfilled them to, and
   * leaving them uncounted would report a version that plainly has history as
   * having none.
   */
  async listFormVersions(formId: string): Promise<FormVersionDto[]> {
    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    const currentVersion = form.version ?? 1;

    const links = await this.formQuestionRepository.find({
      where: { appraisalForm: { form_id: formId } },
      select: { form_question_id: true, version: true, is_active: true },
    });

    const reviews = await this.dataSource
      .getRepository(PerformanceReview)
      .find({
        where: { appraisalForm: { form_id: formId } },
        select: { review_id: true, form_version: true },
      });

    const versions = new Set<number>([currentVersion]);
    for (const link of links) versions.add(link.version ?? 1);
    for (const review of reviews) versions.add(review.form_version ?? 1);

    return [...versions]
      .sort((a, b) => b - a)
      .map((version) => ({
        version,
        isCurrent: version === currentVersion,
        questionCount: links.filter(
          (l) => (l.version ?? 1) === version && l.is_active,
        ).length,
        reviewCount: reviews.filter((r) => (r.form_version ?? 1) === version)
          .length,
      }));
  }

  /**
   * "Name (Copy)", then "(Copy 2)", "(Copy 3)"… until one is free.
   *
   * Form names are unique, so duplicating twice would otherwise 409 on the
   * second attempt — and asking HR to invent a name before they have seen the
   * copy is the wrong order.
   */
  private async nextCopyName(sourceName: string): Promise<string> {
    // Strip any existing suffix first, so copying a copy gives "X (Copy 2)"
    // rather than "X (Copy) (Copy)".
    const base = sourceName.replace(/ \(Copy(?: \d+)?\)$/, '').trim();

    for (let attempt = 1; attempt < 100; attempt++) {
      const candidate =
        attempt === 1 ? `${base} (Copy)` : `${base} (Copy ${attempt})`;
      // 150 is the DTO's max and the column width; a long name would otherwise
      // fail on insert rather than here.
      const name = candidate.slice(0, 150);

      const taken = await this.formRepository.findOne({
        where: { form_name: name },
      });
      if (!taken) return name;
    }

    throw new ConflictException(
      `Too many copies of "${base}" already exist — rename or delete some first.`,
    );
  }

  /**
   * Publishing is the gate that makes a form usable. It is also the only place
   * the 100%-weight rule is enforced as a hard stop — Draft forms are allowed
   * to be mid-edit and not add up.
   *
   * Publishing is additionally where every question is frozen onto its link
   * row. After this point the form no longer reads the shared bank, so HR can
   * keep editing a bank question for other forms without altering this one or
   * the reviews already submitted against it.
   */
  async publishForm(formId: string): Promise<FormDto> {
    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    if (form.status === FormStatus.ARCHIVED) {
      throw new BadRequestException('An archived form cannot be published.');
    }

    const questions = await this.loadFormQuestions(
      this.formQuestionRepository.manager,
      formId,
    );
    const active = questions.filter((fq) => this.isLinkActive(fq));

    if (active.length === 0) {
      throw new BadRequestException(
        'Add at least one active question before publishing.',
      );
    }

    // text_feedback carries no score, so it is excluded from the 100% total
    // rather than being allowed to consume part of it. A weighted comment box
    // would shrink the scored denominator and inflate every review's total.
    const weighted = active.filter(
      (fq) => fq.question?.question_type !== QuestionType.TEXT_FEEDBACK,
    );

    const misweighted = active.filter(
      (fq) =>
        fq.question?.question_type === QuestionType.TEXT_FEEDBACK &&
        Number(fq.weight_percentage || 0) > 0,
    );
    if (misweighted.length > 0) {
      throw new BadRequestException(
        `Text feedback questions cannot carry weight — set them to 0%: ${misweighted
          .map((fq) => fq.question?.question_text ?? '')
          .join(', ')}`,
      );
    }

    if (weighted.length === 0) {
      throw new BadRequestException(
        'A form needs at least one scored question — text feedback alone cannot be graded.',
      );
    }

    const total = this.roundTo2(
      weighted.reduce((sum, fq) => sum + Number(fq.weight_percentage || 0), 0),
    );
    if (total !== 100) {
      throw new BadRequestException(
        `Total weightage of active scored questions must equal 100% (currently ${total}%).`,
      );
    }

    // Option-based questions must still have a usable option list at the moment
    // of publish — the bank could have been edited since the question was
    // attached, and a snapshot of an empty list is unanswerable.
    for (const fq of active) {
      const type = fq.question?.question_type ?? QuestionType.RATING;
      if (!OPTION_BASED_TYPES.includes(type)) continue;

      const options = fq.question?.options ?? [];
      if (options.length < 2) {
        throw new BadRequestException(
          `"${fq.question?.question_text ?? ''}" is a ${type} question but has fewer than two options.`,
        );
      }
      if (!options.some((option) => Number(option.score) > 0)) {
        throw new BadRequestException(
          `"${fq.question?.question_text ?? ''}" needs at least one option worth more than zero.`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const formRepo = manager.getRepository(AppraisalForms);
      const linkRepo = manager.getRepository(AppraisalFormQuestion);

      for (const fq of questions) {
        fq.snapshot_text = fq.question?.question_text ?? '';
        fq.snapshot_type = fq.question?.question_type ?? QuestionType.RATING;
        fq.snapshot_description = fq.description ?? null;
        fq.snapshot_options = [...(fq.question?.options ?? [])]
          .sort((a, b) => a.display_order - b.display_order)
          .map((option) => ({
            optionId: option.option_id,
            optionText: option.option_text,
            score: Number(option.score),
            displayOrder: option.display_order,
          }));
        await linkRepo.save(fq);
      }

      form.status = FormStatus.PUBLISHED;
      form.is_active = true;
      await formRepo.save(form);
    });

    const published = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    return this.toFormDto(published ?? form);
  }

  /**
   * The one entry point for lifecycle changes from the list screen: publish,
   * unpublish, archive, restore, activate, deactivate.
   *
   * Publishing routes through `publishForm` rather than setting the column, so
   * the weight rules and the question snapshotting cannot be bypassed by
   * choosing "Published" from a dropdown instead of clicking Publish.
   *
   * Published → Draft is permitted even with reviews on the form. Versioning is
   * what makes that safe: reviews keep resolving their answers through the link
   * rows of the version they were scored against, so reopening the current
   * version for editing cannot reach them. It is still the blunt option —
   * an unpublished form resolves for nobody, so no new evaluations can be
   * created until it is published again. `createFormVersion` is the flow that
   * keeps the form live while it is reworked.
   *
   * Draft → Archived is allowed, but the reverse restores to Draft, never to
   * Published — a form that was archived mid-draft is not publish-ready, and
   * re-publishing has to re-run the weight checks.
   */
  async changeFormStatus(
    formId: string,
    dto: ChangeFormStatusDto,
    actorId: string,
  ): Promise<FormDto> {
    if (dto.status === undefined && dto.isActive === undefined) {
      throw new BadRequestException(
        'Provide a status, an isActive flag, or both.',
      );
    }

    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    const before = { status: form.status, is_active: form.is_active };

    // Publishing has its own validation and snapshot pass. Delegate, then apply
    // any isActive change on top of the freshly published row.
    if (
      dto.status === FormStatus.PUBLISHED &&
      form.status !== FormStatus.PUBLISHED
    ) {
      if (form.status === FormStatus.ARCHIVED) {
        throw new BadRequestException(
          'Restore this form from the archive before publishing it.',
        );
      }
      await this.publishForm(formId);
      if (dto.isActive === false) {
        await this.formRepository.update(formId, { is_active: false });
      }
      return this.finishStatusChange(formId, before, dto, actorId, form);
    }

    if (dto.status !== undefined && dto.status !== form.status) {
      if (dto.status === FormStatus.DRAFT) {
        /*
         * Unpublishing is now allowed even when reviews exist. With versioning,
         * a form can be edited while reviews stay scored against their frozen
         * version, so the publish-then-lock flow is no longer the only way to
         * rework a form. That said, unpublishing is rarely what you want: it
         * removes the form from `resolveFormForEmployee`, so no new reviews can
         * be created until you publish again. Starting a new version keeps the
         * old one live while you edit.
         */
        form.status = FormStatus.DRAFT;
        // A restored-or-unpublished form is editable again, so it must not stay
        // flagged inactive from its archived state unless asked.
        form.is_active = dto.isActive ?? true;
      } else if (dto.status === FormStatus.ARCHIVED) {
        form.status = FormStatus.ARCHIVED;
        // Archived and active is a contradiction: the scheduler reads is_active
        // to decide what to generate, so an "active archive" would keep
        // producing evaluations for a retired form.
        form.is_active = false;
      }
    }

    if (dto.isActive !== undefined && form.status !== FormStatus.ARCHIVED) {
      form.is_active = dto.isActive;
    }

    await this.formRepository.save(form);
    return this.finishStatusChange(formId, before, dto, actorId, form);
  }

  /** Audit-and-return tail shared by both branches of `changeFormStatus`. */
  private async finishStatusChange(
    formId: string,
    before: { status: string; is_active: boolean },
    dto: ChangeFormStatusDto,
    actorId: string,
    fallback: AppraisalForms,
  ): Promise<FormDto> {
    const fresh =
      (await this.formRepository.findOne({ where: { form_id: formId } })) ??
      fallback;

    await this.audit.record({
      actor: { user_id: actorId },
      action: 'appraisal.form.status',
      entityType: 'appraisal_forms',
      entityId: formId,
      before,
      after: {
        status: fresh.status,
        is_active: fresh.is_active,
        reason: dto.reason ?? null,
      },
    });

    return this.toFormDto(fresh);
  }

  /**
   * Deletes a form outright only when nothing references it. Once reviews exist
   * the form is archived instead, so historical evaluations keep resolving
   * their questions and weights.
   */
  async deleteForm(
    formId: string,
  ): Promise<{ archived: boolean; message: string }> {
    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }

    const reviewCount = await this.dataSource
      .getRepository(PerformanceReview)
      .count({ where: { appraisalForm: { form_id: formId } } });

    if (reviewCount > 0) {
      form.status = FormStatus.ARCHIVED;
      form.is_active = false;
      await this.formRepository.save(form);
      return {
        archived: true,
        message: `Form archived — ${reviewCount} evaluation(s) reference it, so it cannot be deleted.`,
      };
    }

    await this.formRepository.remove(form);
    return { archived: false, message: 'Form deleted.' };
  }

  // ==========================================================================
  // FORM QUESTIONS — HR/Admin
  // Transactional upsert. Generalised from the old single-form saveCriteria:
  // same weight validation and answer-preserving deactivation, now per form.
  // ==========================================================================

  async saveFormQuestions(
    formId: string,
    dto: SaveFormQuestionsDto,
  ): Promise<FormQuestionDto[]> {
    const incoming = dto.questions ?? [];

    if (
      incoming.some(
        (q) => !q.bankQuestionId && q.isActive && !q.questionText?.trim(),
      )
    ) {
      throw new BadRequestException(
        'Every active question needs criteria text, or a bankQuestionId to reuse an existing one.',
      );
    }

    // One bank question cannot appear twice on the same form: both links would
    // key answers to the same wording, and the weights would double-count.
    const reusedIds = incoming
      .map((q) => q.bankQuestionId)
      .filter((id): id is string => Boolean(id));
    if (new Set(reusedIds).size !== reusedIds.length) {
      throw new BadRequestException(
        'The same question cannot be added to a form twice.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const formRepo = manager.getRepository(AppraisalForms);
      const formQuestionRepo = manager.getRepository(AppraisalFormQuestion);
      const questionRepo = manager.getRepository(AppraisalQuestion);
      const answerRepo = manager.getRepository(PerformanceReviewAnswer);

      const form = await formRepo.findOne({ where: { form_id: formId } });
      if (!form) {
        throw new NotFoundException('Appraisal form not found');
      }

      // Questions and weights are frozen once a form leaves Draft — this is
      // what stops a published form changing underneath in-flight reviews.
      if (form.status !== FormStatus.DRAFT) {
        throw new BadRequestException(
          `Questions can only be edited while the form is in Draft (this form is ${form.status}). Create a new form or revert it to Draft.`,
        );
      }

      const existing = await this.loadFormQuestions(manager, formId);
      const existingById = new Map(
        existing.map((fq) => [fq.form_question_id, fq]),
      );

      const keptIds = new Set<string>();
      let order = 1;

      for (const item of incoming) {
        const match = item.questionId
          ? existingById.get(item.questionId)
          : undefined;

        // Resolve the bank row this link should point at. Questions ARE shared
        // across forms now — that is the reuse the spec asks for. What protects
        // one form from another's edits is not privacy, it is the publish-time
        // snapshot on the link row: a Published form reads its frozen copy and
        // stops following the bank entirely. Editing a shared question through
        // a form builder is still refused below, because that edit would be
        // invisible from the other forms it silently changed.
        const question = await this.resolveBankQuestion(manager, item, match);

        const type = question.question_type;

        if (type === QuestionType.TEXT_FEEDBACK && Number(item.weightage) > 0) {
          throw new BadRequestException(
            `"${question.question_text}" is a text feedback question, so its weight must be 0% — there is nothing to score.`,
          );
        }

        const link =
          match ??
          formQuestionRepo.create({
            appraisalForm: form,
            question,
            // New links belong to the version being edited, not to version 1.
            // Without this a question added while reworking v2 would be invisible
            // to `loadFormQuestions`, which filters on the form's current version.
            version: form.version ?? 1,
          });

        link.question = question;
        link.weight_percentage = Number(item.weightage);
        link.rating_scale = item.ratingScale ?? link.rating_scale ?? 10;
        link.rating_min = item.ratingMin ?? link.rating_min ?? 1;
        link.min_label = item.minLabel?.trim() || null;
        link.max_label = item.maxLabel?.trim() || null;
        link.description = item.description?.trim() || null;
        link.display_order = order++;
        link.is_required = item.isRequired ?? link.is_required ?? true;
        // Per-link, not per-bank-question: deactivating on this form must not
        // reach the other forms sharing the same bank row.
        link.is_active = item.isActive;

        // A Draft form must not carry a stale snapshot. If this form was
        // published and reverted, the old freeze would keep overriding the live
        // bank and the builder would show wording nobody can edit.
        link.snapshot_text = null;
        link.snapshot_type = null;
        link.snapshot_options = null;
        link.snapshot_description = null;

        const savedLink = await formQuestionRepo.save(link);
        keptIds.add(savedLink.form_question_id);
      }

      // Reconcile removals.
      for (const fq of existing) {
        if (keptIds.has(fq.form_question_id)) continue;

        const answerCount = await answerRepo.count({
          where: { formQuestion: { form_question_id: fq.form_question_id } },
        });

        if (answerCount === 0) {
          await formQuestionRepo.remove(fq);

          // Only reap the bank row if nothing else points at it. With reuse,
          // "no other links" is now genuinely possible to be false, so this
          // check is what stops one form's edit deleting another form's
          // question out from under it.
          const otherLinks = await formQuestionRepo.count({
            where: { question: { question_id: fq.question.question_id } },
          });
          if (otherLinks === 0) {
            await questionRepo.remove(fq.question);
          }
        } else {
          // Preserve historical answers — deactivate rather than delete. The
          // flag goes on the LINK, not the bank question: the answers belong to
          // this form, and blanking the bank row would strip the question from
          // every other form that shares it.
          fq.is_active = false;
          await formQuestionRepo.save(fq);
        }
      }
    });

    const refreshed = await this.loadFormQuestions(
      this.formQuestionRepository.manager,
      formId,
    );
    return refreshed.map((fq) => this.toFormQuestion(fq));
  }

  /**
   * Decides which bank row a form link should point at, and applies any inline
   * edit the builder sent.
   *
   * Three paths:
   *  - `bankQuestionId` set → reuse that row verbatim. Text, type and options
   *    are ignored; the bank owns them.
   *  - existing link, no `bankQuestionId` → edit the bank row in place, unless
   *    another form shares it. A shared row is refused rather than edited: the
   *    change would land on forms the editor cannot see from here, and the whole
   *    point of the bank endpoint is that it reports that blast radius back.
   *  - no link → create a new bank row. It is a normal bank entry from birth,
   *    so it shows up for reuse instead of being invisibly form-private.
   */
  private async resolveBankQuestion(
    manager: EntityManager,
    item: SaveFormQuestionsDto['questions'][number],
    existingLink?: AppraisalFormQuestion,
  ): Promise<AppraisalQuestion> {
    const questionRepo = manager.getRepository(AppraisalQuestion);

    if (item.bankQuestionId) {
      const question = await questionRepo.findOne({
        where: { question_id: item.bankQuestionId },
        relations: { options: true },
      });
      if (!question) {
        throw new NotFoundException(
          `Question ${item.bankQuestionId} does not exist in the question bank.`,
        );
      }
      if (!question.is_active) {
        throw new BadRequestException(
          `"${question.question_text}" is archived in the question bank and cannot be added to a form.`,
        );
      }
      return question;
    }

    const text = item.questionText?.trim() ?? '';
    const type = item.questionType ?? QuestionType.RATING;

    if (existingLink) {
      const question = existingLink.question;
      // Captured before the in-place edit below, or every later comparison
      // against it would be against the new value and always be false.
      const previousType = question.question_type;
      const typeChanged = type !== previousType;

      const changesContent =
        (text && text !== question.question_text) ||
        typeChanged ||
        item.options !== undefined;

      if (changesContent) {
        const links = await this.questionBank.countLinks(
          manager,
          question.question_id,
        );
        if (links > 1) {
          throw new ConflictException(
            `"${question.question_text}" is shared with ${links - 1} other form(s), so it cannot be reworded from this form's builder. Edit it under Question Bank — that endpoint reports which forms the change reaches — or remove it here and add a new question.`,
          );
        }

        // Changing the type invalidates any answer already recorded against it,
        // because a stored option id means nothing on a rating question and the
        // percentage it produced cannot be recomputed.
        if (typeChanged) {
          const answers = await manager
            .getRepository(PerformanceReviewAnswer)
            .count({
              where: {
                formQuestion: {
                  form_question_id: existingLink.form_question_id,
                },
              },
            });
          if (answers > 0) {
            throw new ConflictException(
              `"${question.question_text}" already has ${answers} recorded answer(s), so its type cannot be changed. Remove it from this form and add a new question instead.`,
            );
          }
        }
      }

      if (text) {
        question.question_text = text;
      }
      question.question_type = type;
      await questionRepo.save(question);

      if (item.options !== undefined || type !== question.question_type) {
        await this.questionBank.syncOptions(
          manager,
          question.question_id,
          type,
          item.options,
        );
      }

      return (
        (await questionRepo.findOne({
          where: { question_id: question.question_id },
          relations: { options: true },
        })) ?? question
      );
    }

    const created = await questionRepo.save(
      questionRepo.create({
        question_text: text,
        question_type: type,
        is_active: true,
      }),
    );

    await this.questionBank.syncOptions(
      manager,
      created.question_id,
      type,
      item.options,
    );

    return (
      (await questionRepo.findOne({
        where: { question_id: created.question_id },
        relations: { options: true },
      })) ?? created
    );
  }

  // ==========================================================================
  // ASSIGNMENTS — HR/Admin
  // ==========================================================================

  async listAssignments(formId: string): Promise<AssignmentDto[]> {
    const assignments = await this.assignmentRepository.find({
      where: { form: { form_id: formId } },
      relations: {
        form: true,
        department: true,
        designation: true,
        user: true,
      },
      order: { created_at: 'DESC' },
    });

    return assignments.map((a) => this.toAssignmentDto(a));
  }

  async createAssignment(
    formId: string,
    dto: CreateAssignmentDto,
  ): Promise<AssignmentDto> {
    const targets = [
      dto.departmentId,
      dto.designationId,
      dto.employeeId,
    ].filter(Boolean);
    if (targets.length !== 1) {
      throw new BadRequestException(
        'Provide exactly one of departmentId, designationId, or employeeId.',
      );
    }

    const form = await this.formRepository.findOne({
      where: { form_id: formId },
    });
    if (!form) {
      throw new NotFoundException('Appraisal form not found');
    }
    // Draft forms may be assigned. Audience is part of building a form, not a
    // separate step after it goes live, and a Draft's assignments are inert
    // anyway: `resolveFormForEmployee` only ever matches PUBLISHED forms, so a
    // Draft with departments attached still generates nothing. Archived stays
    // refused — that form is history and its audience should not move.
    if (form.status === FormStatus.ARCHIVED) {
      throw new BadRequestException('An archived form cannot be assigned.');
    }

    const assignment = this.assignmentRepository.create({ form });

    if (dto.departmentId) {
      const department = await this.dataSource
        .getRepository(Department)
        .findOne({ where: { department_id: dto.departmentId } });
      if (!department) throw new NotFoundException('Department not found');
      assignment.department = department;
    } else if (dto.designationId) {
      const designation = await this.dataSource
        .getRepository(Designation)
        .findOne({ where: { designation_id: dto.designationId } });
      if (!designation) throw new NotFoundException('Designation not found');
      assignment.designation = designation;
    } else {
      const user = await this.userRepository.findOne({
        where: { user_id: dto.employeeId },
      });
      if (!user) throw new NotFoundException('Employee not found');
      assignment.user = user;
    }

    const existing = await this.assignmentRepository.findOne({
      where: {
        form: { form_id: formId },
        ...(dto.departmentId
          ? { department: { department_id: dto.departmentId } }
          : {}),
        ...(dto.designationId
          ? { designation: { designation_id: dto.designationId } }
          : {}),
        ...(dto.employeeId ? { user: { user_id: dto.employeeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'This form is already assigned to that target.',
      );
    }

    const saved = await this.assignmentRepository.save(assignment);

    const hydrated = await this.assignmentRepository.findOne({
      where: { assignment_id: saved.assignment_id },
      relations: {
        form: true,
        department: true,
        designation: true,
        user: true,
      },
    });

    return this.toAssignmentDto(hydrated!);
  }

  async deleteAssignment(assignmentId: string): Promise<{ message: string }> {
    const assignment = await this.assignmentRepository.findOne({
      where: { assignment_id: assignmentId },
    });
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.assignmentRepository.remove(assignment);
    return { message: 'Assignment removed.' };
  }

  /**
   * Resolves which published form applies to an employee.
   *
   * Most specific target wins: employee → designation → department. Within a
   * tier the newest assignment wins, so re-assigning supersedes without
   * needing to delete the old row first.
   *
   * The rule itself now lives on `AppraisalFormResolverService`, in the leaf
   * forms module, because `PerformanceReviewService` needs the same answer when
   * it writes an auto-zero review for an absence and cannot import this service
   * without a cycle. This method stays as-is for its existing callers.
   */
  async resolveFormForEmployee(
    employeeId: string,
    manager?: EntityManager,
  ): Promise<AppraisalForms | null> {
    return this.formResolver.resolveFormForEmployee(employeeId, manager);
  }

  // ==========================================================================
  // TEAM — Team Lead
  // ==========================================================================

  /**
   * The employees one Team Lead may see and evaluate.
   *
   * This is the single authority for that question. `getMyTeam` and
   * `assertCanReview` both route through it via
   * `resolveEvaluableEmployeeIds`, and they must: scoping only the
   * roster read would hide an employee from the list while `POST
   * /appraisal/evaluate/:employeeId` still accepted them, which is a worse bug
   * than no scoping at all — it looks enforced and is not.
   *
   * The roster is the union of three sources:
   *
   *  - direct links — every active employee whose `User.team_lead_id` points at
   *    this lead. This is the per-employee evaluator assignment set on the
   *    employee form; the scheduler stamps auto-generated reviews from the same
   *    column, so the roster and the stamped reviewer cannot disagree. The
   *    evaluator may belong to a different department than the employee.
   *  - `MEMBERS`    — exactly the `team_lead_assignment_members` join rows.
   *  - `DEPARTMENT` — every active member of that department, which is what the
   *    whole system did implicitly before assignments existed. Migration
   *    `1787300000000` backfilled one of these per existing lead, so nobody's
   *    visible roster changed on deploy.
   *
   * A lead with no direct links and no assignment row resolves to an empty set,
   * not to their own department. That keeps MEMBERS mode enforceable — HR
   * narrowing a lead to three people must not leave a department-wide fallback
   * open underneath it.
   *
   * The requester is always removed: self-review is blocked separately in
   * `assertCanReview`, and a lead assigned to their own department would
   * otherwise appear in their own team list.
   *
   * Public because the workflow, scheduler, and stats services all need the same
   * answer, and a second implementation of it would be a second thing to get
   * wrong.
   */
  async resolveVisibleEmployeeIds(
    leadId: string,
    manager?: EntityManager,
  ): Promise<Set<string>> {
    const assignmentRepo = manager
      ? manager.getRepository(TeamLeadAssignment)
      : this.dataSource.getRepository(TeamLeadAssignment);
    const userRepo = manager
      ? manager.getRepository(User)
      : this.userRepository;

    const assignments = await assignmentRepo.find({
      where: { teamLead: { user_id: leadId } },
      relations: { department: true, members: true },
    });

    const visible = new Set<string>();

    // Direct evaluator links (User.team_lead_id). Authoritative on their own:
    // the scheduler stamps every auto-generated review with
    // `employee.team_lead_id`, so a lead assigned to an employee this way must
    // be able to see and evaluate them even without a TeamLeadAssignment row —
    // and regardless of department, since a cross-department evaluator is valid.
    const directReports = await userRepo.find({
      where: { team_lead_id: leadId, status: true },
      select: { user_id: true },
    });
    for (const report of directReports) {
      visible.add(report.user_id);
    }

    const departmentIds = assignments
      .filter((a) => a.mode === TeamLeadAssignmentMode.DEPARTMENT)
      .map((a) => a.department?.department_id)
      .filter((id): id is string => Boolean(id));

    if (departmentIds.length > 0) {
      // Only active employees, matching the pre-assignment behaviour: a
      // deactivated account has nothing to evaluate.
      const departmentMembers = await userRepo.find({
        where: {
          department: { department_id: In(departmentIds) },
          status: true,
        },
        select: { user_id: true },
      });
      for (const member of departmentMembers) {
        visible.add(member.user_id);
      }
    }

    for (const assignment of assignments) {
      if (assignment.mode !== TeamLeadAssignmentMode.MEMBERS) continue;
      for (const member of assignment.members ?? []) {
        visible.add(member.user_id);
      }
    }

    visible.delete(leadId);

    return visible;
  }

  /**
   * The employees a given reviewer may evaluate — the roster for a Team Lead,
   * the whole active organisation for an administrator.
   *
   * `appraisal.viewAll` is the test. It is the key that already means "this
   * person's remit is the entire company" everywhere else in the module
   * (`GET /appraisal/evaluations`, `/analytics`, and the `scope: 'all'` branch
   * of the stats service), so reusing it keeps one answer to "who is an
   * administrator here" instead of inventing a second one that would drift.
   *
   * An administrator has no `team_lead_assignments` row and never will — HR does
   * not put their own name on a roster — so without this they resolve to an
   * empty set and can evaluate nobody at all, which is the restriction this
   * removes.
   *
   * Self is still excluded. Falling through to `resolveVisibleEmployeeIds` for
   * everyone else is what keeps a Team Lead scoped: the bypass is a widening for
   * one permission, not a new code path around the roster check.
   *
   * Like the roster resolver this is the single authority for its question:
   * `getMyTeam` and `assertCanReview` both call it, so the list a reviewer sees
   * and the set the guard accepts cannot disagree.
   */
  async resolveEvaluableEmployeeIds(
    reviewerId: string,
    manager?: EntityManager,
  ): Promise<Set<string>> {
    const orgWide = await this.authorization.hasPermission(
      reviewerId,
      'appraisal.viewAll',
    );
    if (!orgWide) {
      return this.resolveVisibleEmployeeIds(reviewerId, manager);
    }

    const userRepo = manager
      ? manager.getRepository(User)
      : this.userRepository;

    // Active only, matching the roster resolver: a deactivated account has
    // nothing to evaluate, and an administrator is not an exception to that.
    const everyone = await userRepo.find({
      where: { status: true },
      select: { user_id: true },
    });

    const visible = new Set(everyone.map((u) => u.user_id));
    visible.delete(reviewerId);

    return visible;
  }

  async getMyTeam(requesterId: string): Promise<TeamMemberDto[]> {
    const requester = await this.userRepository.findOne({
      where: { user_id: requesterId },
      relations: { designation: true },
    });
    if (!requester) {
      throw new NotFoundException('Authenticated user not found');
    }

    const visibleIds = await this.resolveEvaluableEmployeeIds(requesterId);

    // An evaluator with nobody to evaluate still owes their own evaluation,
    // provided HR named their designation on the form. Without this the roster
    // is empty and the form they are eligible for is unreachable — the guard
    // would allow the submission that the UI never offers.
    if (visibleIds.size === 0) {
      const { allowed } = await this.selfReviewEligibility(
        requester,
        visibleIds,
      );
      if (!allowed) return [];
      visibleIds.add(requesterId);
    }

    // Re-read through the id set rather than trusting the resolver's own rows:
    // a MEMBERS assignment can name an employee who has since been deactivated,
    // and that employee should drop off the roster without HR having to edit the
    // assignment.
    const members = await this.userRepository.find({
      where: { user_id: In([...visibleIds]), status: true },
      relations: { department: true, designation: true },
      order: { first_name: 'ASC' },
    });

    if (members.length === 0) {
      return [];
    }

    // Reviews for these members, whoever wrote them.
    //
    // The roster question is "has this period been evaluated", not "did *I*
    // evaluate it": two leads can share a member, HR can evaluate anyone, and
    // the absence job writes reviews with no lead involved at all. Scoping this
    // to `reviewer: requesterId` reported Pending for work that was already
    // done — and then invited a second submission that the unique index on
    // (reviewee, form, period) rejects.
    //
    // Drafts are excluded: the scheduler pre-creates one per member per period,
    // so counting them would flip the whole roster to Completed the moment the
    // job runs, and their 0% would headline `lastScore`.
    const reviews = await this.dataSource
      .getRepository(PerformanceReview)
      .find({
        where: {
          reviewee: { user_id: In(members.map((m) => m.user_id)) },
          status: In(LOCKED_REVIEW_STATUSES),
        },
        relations: { reviewee: true, appraisalForm: true },
        order: { created_at: 'DESC' },
      });

    // Newest-first within each employee, inherited from the query order.
    const historyByEmployee = new Map<string, PerformanceReview[]>();
    for (const review of reviews) {
      const id = review.reviewee?.user_id;
      if (!id) continue;
      const history = historyByEmployee.get(id);
      if (history) history.push(review);
      else historyByEmployee.set(id, [review]);
    }

    const now = new Date();

    return Promise.all(
      members.map(async (member) => {
        const form = await this.resolveFormForEmployee(member.user_id);
        const history = historyByEmployee.get(member.user_id) ?? [];
        const latest = history[0] ?? null;

        // Pending is about the period that is open now, on the form this member
        // is actually assigned. A review from last month, or against a form
        // they have since been moved off, does not settle this one.
        const currentPeriod = form
          ? cadenceFor(form.evaluation_type).periodKey(now)
          : null;
        const doneThisPeriod =
          form !== null &&
          history.some(
            (review) =>
              review.appraisalForm?.form_id === form.form_id &&
              review.review_period === currentPeriod,
          );

        return {
          employeeId: member.user_id,
          employeeCode: member.employee_code,
          firstName: member.first_name,
          lastName: member.last_name,
          email: member.email,
          designation: member.designation?.title ?? '',
          department: member.department?.department_name ?? '',
          joiningDate: this.toDateString(member.joining_date),
          status: this.toMemberStatus(member),
          avatarUrl: member.profile_image ?? undefined,
          avatarThumbUrl: member.profile_image_thumb ?? undefined,
          assignedFormId: form?.form_id ?? null,
          assignedFormName: form?.form_name ?? null,
          evaluationStatus: !form
            ? ('Unassigned' as const)
            : doneThisPeriod
              ? ('Completed' as const)
              : ('Pending' as const),
          lastReviewedAt: latest ? this.toDateString(latest.review_date) : null,
          lastScore: latest
            ? this.roundTo2(Number(latest.total_score_percentage))
            : null,
        };
      }),
    );
  }

  async getTeamStats(requesterId: string): Promise<TeamStatsDto> {
    const team = await this.getMyTeam(requesterId);

    // Counted the same way the roster labels each row, so the header card and
    // the table cannot disagree: done / outstanding *for the period that is
    // open now*. Members with no assigned form are in neither bucket — nothing
    // is expected of them, so counting them as pending would make a completion
    // rate no lead can ever reach.
    const evaluated = team.filter(
      (m) => m.evaluationStatus === 'Completed',
    ).length;
    const pending = team.filter((m) => m.evaluationStatus === 'Pending').length;
    const expected = evaluated + pending;

    // Scores are a separate question: the distribution is of the latest score
    // on record, which is worth showing even when it predates this period.
    const scored = team.filter((m) => m.lastScore !== null);

    const average =
      scored.length > 0
        ? this.roundTo2(
            scored.reduce((sum, m) => sum + (m.lastScore ?? 0), 0) /
              scored.length,
          )
        : null;

    return {
      teamSize: team.length,
      evaluated,
      pending,
      completionRate:
        expected > 0 ? this.roundTo2((evaluated / expected) * 100) : 0,
      averageScore: average,
      distribution: this.toDistribution(scored.map((m) => m.lastScore ?? 0)),
    };
  }

  // ==========================================================================
  // TEAM LEAD ASSIGNMENTS — HR/Admin
  // ==========================================================================

  async listTeamLeadAssignments(
    teamLeadId?: string,
  ): Promise<TeamLeadAssignmentDto[]> {
    const assignments = await this.dataSource
      .getRepository(TeamLeadAssignment)
      .find({
        where: teamLeadId ? { teamLead: { user_id: teamLeadId } } : {},
        relations: {
          teamLead: true,
          department: true,
          members: { user: true },
        },
        order: { created_at: 'DESC' },
      });

    return assignments.map((a) => this.toTeamLeadAssignmentDto(a));
  }

  /**
   * Creates a roster grant.
   *
   * DEPARTMENT mode is capped at one row per lead by the partial unique index
   * `UQ_tla_lead_department_mode`; that is caught here first so the caller gets a
   * 409 with an explanation instead of a driver error.
   */
  async createTeamLeadAssignment(
    dto: CreateTeamLeadAssignmentDto,
    actorId: string,
  ): Promise<TeamLeadAssignmentDto> {
    const isDepartmentMode = dto.mode === TeamLeadAssignmentMode.DEPARTMENT;

    if (isDepartmentMode) {
      if (!dto.departmentId) {
        throw new BadRequestException(
          'departmentId is required for DEPARTMENT mode.',
        );
      }
      if (dto.memberIds?.length) {
        throw new BadRequestException(
          'memberIds does not apply to DEPARTMENT mode — the whole department is covered.',
        );
      }
    } else {
      if (!dto.memberIds?.length) {
        throw new BadRequestException(
          'memberIds is required for MEMBERS mode.',
        );
      }
      if (dto.departmentId) {
        throw new BadRequestException(
          'departmentId does not apply to MEMBERS mode — list the employees instead.',
        );
      }
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const assignmentRepo = manager.getRepository(TeamLeadAssignment);

      const teamLead = await userRepo.findOne({
        where: { user_id: dto.teamLeadId },
      });
      if (!teamLead) {
        throw new NotFoundException('Team Lead not found');
      }

      const assignment = assignmentRepo.create({
        teamLead,
        mode: dto.mode,
        createdBy: { user_id: actorId } as User,
      });

      if (isDepartmentMode) {
        const department = await manager
          .getRepository(Department)
          .findOne({ where: { department_id: dto.departmentId } });
        if (!department) {
          throw new NotFoundException('Department not found');
        }

        const existing = await assignmentRepo.findOne({
          where: {
            teamLead: { user_id: dto.teamLeadId },
            mode: TeamLeadAssignmentMode.DEPARTMENT,
          },
          relations: { department: true },
        });
        if (existing) {
          throw new ConflictException(
            `This Team Lead already has a department-wide assignment (${
              existing.department?.department_name ?? 'unknown department'
            }). Update or remove it first.`,
          );
        }

        assignment.department = department;
      } else {
        const memberIds = [...new Set(dto.memberIds)];
        if (memberIds.includes(dto.teamLeadId)) {
          throw new BadRequestException(
            'A Team Lead cannot be a member of their own team — self-evaluation is not allowed.',
          );
        }

        // Validate the whole list before writing any of it, so a single bad id
        // fails the request rather than half-creating a roster.
        const members = await userRepo.find({
          where: { user_id: In(memberIds) },
        });
        if (members.length !== memberIds.length) {
          const found = new Set(members.map((m) => m.user_id));
          const missing = memberIds.filter((id) => !found.has(id));
          throw new BadRequestException(
            `These employee ids do not exist: ${missing.join(', ')}`,
          );
        }

        assignment.members = memberIds.map((userId) =>
          manager.getRepository(TeamLeadAssignmentMember).create({
            user_id: userId,
          }),
        );
      }

      // `cascade: true` on the members relation writes the join rows with it.
      const created = await assignmentRepo.save(assignment);

      await this.audit.record({
        actor: { user_id: actorId },
        action: 'appraisal.teamlead.assign',
        entityType: 'team_lead_assignments',
        entityId: created.assignment_id,
        after: {
          team_lead_id: dto.teamLeadId,
          mode: dto.mode,
          department_id: dto.departmentId ?? null,
          member_count: dto.memberIds?.length ?? null,
        },
        manager,
      });

      return created;
    });

    const hydrated = await this.dataSource
      .getRepository(TeamLeadAssignment)
      .findOne({
        where: { assignment_id: saved.assignment_id },
        relations: {
          teamLead: true,
          department: true,
          members: { user: true },
        },
      });

    return this.toTeamLeadAssignmentDto(hydrated!);
  }

  /** Replaces a MEMBERS roster wholesale — the builder sends the full list. */
  async updateTeamLeadAssignmentMembers(
    assignmentId: string,
    dto: UpdateTeamLeadAssignmentMembersDto,
    actorId: string,
  ): Promise<TeamLeadAssignmentDto> {
    await this.dataSource.transaction(async (manager) => {
      const assignmentRepo = manager.getRepository(TeamLeadAssignment);
      const memberRepo = manager.getRepository(TeamLeadAssignmentMember);

      const assignment = await assignmentRepo.findOne({
        where: { assignment_id: assignmentId },
        relations: { teamLead: true, members: true },
      });
      if (!assignment) {
        throw new NotFoundException('Team Lead assignment not found');
      }
      if (assignment.mode !== TeamLeadAssignmentMode.MEMBERS) {
        throw new BadRequestException(
          'Only a MEMBERS-mode assignment has a member list. A department-wide grant covers everyone in its department.',
        );
      }

      const memberIds = [...new Set(dto.memberIds)];
      if (memberIds.includes(assignment.teamLead.user_id)) {
        throw new BadRequestException(
          'A Team Lead cannot be a member of their own team — self-evaluation is not allowed.',
        );
      }

      const members = await manager
        .getRepository(User)
        .find({ where: { user_id: In(memberIds) } });
      if (members.length !== memberIds.length) {
        const found = new Set(members.map((m) => m.user_id));
        const missing = memberIds.filter((id) => !found.has(id));
        throw new BadRequestException(
          `These employee ids do not exist: ${missing.join(', ')}`,
        );
      }

      const before = (assignment.members ?? []).map((m) => m.user_id);

      // Delete-then-insert rather than diffing: the join row carries no state
      // beyond its own key, so there is nothing a diff would preserve. Both
      // statements are in this transaction, so the roster is never briefly empty
      // to a concurrent reader.
      await memberRepo.delete({ assignment_id: assignmentId });
      await memberRepo.insert(
        memberIds.map((userId) => ({
          assignment_id: assignmentId,
          user_id: userId,
        })),
      );

      await this.audit.record({
        actor: { user_id: actorId },
        action: 'appraisal.teamlead.assign',
        entityType: 'team_lead_assignments',
        entityId: assignmentId,
        before: { member_ids: before },
        after: { member_ids: memberIds },
        manager,
      });
    });

    const hydrated = await this.dataSource
      .getRepository(TeamLeadAssignment)
      .findOne({
        where: { assignment_id: assignmentId },
        relations: {
          teamLead: true,
          department: true,
          members: { user: true },
        },
      });

    return this.toTeamLeadAssignmentDto(hydrated!);
  }

  async deleteTeamLeadAssignment(
    assignmentId: string,
    actorId: string,
  ): Promise<{ message: string }> {
    return this.dataSource.transaction(async (manager) => {
      const assignmentRepo = manager.getRepository(TeamLeadAssignment);

      const assignment = await assignmentRepo.findOne({
        where: { assignment_id: assignmentId },
        relations: { teamLead: true, department: true, members: true },
      });
      if (!assignment) {
        throw new NotFoundException('Team Lead assignment not found');
      }

      await this.audit.record({
        actor: { user_id: actorId },
        action: 'appraisal.teamlead.unassign',
        entityType: 'team_lead_assignments',
        entityId: assignmentId,
        before: {
          team_lead_id: assignment.teamLead?.user_id ?? null,
          mode: assignment.mode,
          department_id: assignment.department?.department_id ?? null,
          member_ids: (assignment.members ?? []).map((m) => m.user_id),
        },
        manager,
      });

      // The join rows go with it — `team_lead_assignment_members.assignment_id`
      // is ON DELETE CASCADE. Reviews already submitted are untouched: they
      // reference users, not assignments.
      await assignmentRepo.remove(assignment);

      return {
        message:
          'Team Lead assignment removed. The lead can no longer see those employees.',
      };
    });
  }

  private toTeamLeadAssignmentDto(
    assignment: TeamLeadAssignment,
  ): TeamLeadAssignmentDto {
    return {
      assignmentId: assignment.assignment_id,
      teamLeadId: assignment.teamLead?.user_id ?? '',
      teamLeadName: assignment.teamLead
        ? `${assignment.teamLead.first_name} ${assignment.teamLead.last_name}`.trim()
        : '',
      teamLeadEmail: assignment.teamLead?.email ?? '',
      mode: assignment.mode,
      departmentId: assignment.department?.department_id ?? null,
      departmentName: assignment.department?.department_name ?? null,
      members: (assignment.members ?? [])
        .map((member) => ({
          employeeId: member.user_id,
          employeeCode: member.user?.employee_code ?? '',
          name: member.user
            ? `${member.user.first_name} ${member.user.last_name}`.trim()
            : '',
          email: member.user?.email ?? '',
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      memberCount:
        assignment.mode === TeamLeadAssignmentMode.MEMBERS
          ? (assignment.members ?? []).length
          : null,
      createdAt: this.toIsoString(assignment.created_at),
    };
  }

  // ==========================================================================
  // EVALUATION — Team Lead
  // ==========================================================================

  /**
   * A reviewer may only touch employees they can evaluate, and never
   * themselves.
   *
   * Authority comes from `resolveEvaluableEmployeeIds`: `team_lead_assignments`
   * for a lead, every active employee for an `appraisal.viewAll` holder. Not
   * from department co-membership — the difference matters in the case the
   * assignment table exists to serve: two leads in one department, each owning a
   * subset of it. Under the old same-department check either lead could evaluate
   * any of the other's reports.
   */
  private async assertCanReview(
    reviewerId: string,
    employeeId: string,
    manager?: EntityManager,
  ): Promise<{ reviewer: User; reviewee: User }> {
    const repo = manager ? manager.getRepository(User) : this.userRepository;

    const reviewer = await repo.findOne({
      where: { user_id: reviewerId },
      relations: { department: true, designation: true },
    });
    if (!reviewer) {
      throw new NotFoundException('Reviewer not found');
    }

    const reviewee = await repo.findOne({
      where: { user_id: employeeId },
      relations: { department: true },
    });
    if (!reviewee) {
      throw new NotFoundException('Employee not found');
    }

    const visibleIds = await this.resolveEvaluableEmployeeIds(
      reviewerId,
      manager,
    );

    if (reviewerId === employeeId) {
      await this.assertCanSelfReview(reviewer, visibleIds, manager);
      return { reviewer, reviewee };
    }

    if (!reviewee.status) {
      // Truthful for both an administrator and a lead, and it discloses nothing
      // new: the `Employee not found` branch above already confirms whether an
      // id exists.
      throw new ForbiddenException(
        'This employee is deactivated and cannot be evaluated.',
      );
    }

    if (!visibleIds.has(employeeId)) {
      // Deliberately the same message whether the employee is on nobody's roster
      // or on another lead's: confirming which would let a lead enumerate staff
      // outside their scope one id at a time.
      throw new ForbiddenException(
        'This employee is not assigned to you. Ask HR to update your team assignment.',
      );
    }

    return { reviewer, reviewee };
  }

  /**
   * Self-evaluation, allowed only in the one case where refusing it loses data.
   *
   * HR selects the designations that evaluate under a form — typically Team
   * Lead. A lead with no reports would then be named as an evaluator and have
   * nobody to evaluate, so their period simply produces nothing. That is the
   * gap this closes: they evaluate themselves instead.
   *
   * Two conditions, both required:
   *  - **The roster is empty.** A lead with even one report has real work to do,
   *    and grading yourself alongside grading your team is not an evaluation.
   *  - **Their designation is on the form.** Otherwise any employee whose lead
   *    happens to be unset could self-grade, which is not an edge case being
   *    rescued — it is a missing assignment being papered over.
   */
  private async assertCanSelfReview(
    reviewer: User,
    visibleIds: Set<string>,
    manager?: EntityManager,
  ): Promise<void> {
    const { allowed, reason } = await this.selfReviewEligibility(
      reviewer,
      visibleIds,
      manager,
    );
    if (!allowed) {
      throw new ForbiddenException(reason ?? 'You cannot evaluate yourself.');
    }
  }

  /**
   * The non-throwing form of the self-review rule, so the roster endpoint and
   * the guard cannot disagree about who may self-evaluate.
   *
   * `getMyTeam` needs the boolean to decide whether to put the lead on their own
   * roster; `assertCanReview` needs the reason to explain a refusal. Two copies
   * of this test would eventually allow it in one place and refuse it in the
   * other, which reads as a bug in whichever half the user hits second.
   */
  async selfReviewEligibility(
    reviewer: User,
    visibleIds: Set<string>,
    manager?: EntityManager,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // `resolveVisibleEmployeeIds` already strips the lead's own id; filtering
    // again keeps this honest if that ever changes, since a DEPARTMENT-mode
    // grant does include the lead themselves before that strip.
    const reports = [...visibleIds].filter((id) => id !== reviewer.user_id);
    if (reports.length > 0) {
      return {
        allowed: false,
        reason:
          'You cannot evaluate yourself while you have team members to evaluate.',
      };
    }

    const designationId = reviewer.designation?.designation_id;
    if (!designationId) {
      return { allowed: false, reason: 'You cannot evaluate yourself.' };
    }

    const form = await this.resolveFormForEmployee(reviewer.user_id, manager);
    if (!form) {
      return { allowed: false, reason: 'You cannot evaluate yourself.' };
    }

    const assignmentRepo = manager
      ? manager.getRepository(AppraisalFormAssignment)
      : this.assignmentRepository;

    const onEvaluatorList = await assignmentRepo.findOne({
      where: {
        form: { form_id: form.form_id },
        designation: { designation_id: designationId },
      },
    });

    if (!onEvaluatorList) {
      return {
        allowed: false,
        reason:
          'You cannot evaluate yourself. Ask HR to assign you a team, or to add your designation as an evaluator on this form.',
      };
    }

    return { allowed: true };
  }

  /** The form the reviewer should fill in, plus any prior submission. */
  async getEvaluationForm(
    reviewerId: string,
    employeeId: string,
  ): Promise<EvaluationFormDto> {
    const { reviewee } = await this.assertCanReview(reviewerId, employeeId);

    const form = await this.resolveFormForEmployee(employeeId);
    if (!form) {
      throw new NotFoundException(
        'No published appraisal form is assigned to this employee. Ask HR to assign one.',
      );
    }

    const questions = await this.loadFormQuestions(
      this.formQuestionRepository.manager,
      form.form_id,
    );

    // The cadence names the period, and the client is told rather than asked to
    // guess. Scoping `existing` to it matters as much as returning it: the
    // previous lookup took the newest review for this reviewer/employee/form
    // regardless of period, so on a Daily form yesterday's submission was
    // prefilled into today's blank one under a banner promising an overwrite
    // that `submitEvaluation` — which keys on `review_period` — would never
    // perform.
    const reviewPeriod = cadenceFor(form.evaluation_type).periodKey(new Date());

    /*
     * Keyed on reviewee + form + period and nothing else, to match both
     * `UQ_pr_reviewee_form_period` and the lookup in `submitEvaluation`. Scoping
     * it to the requesting reviewer as well hid the scheduler's Draft (stamped
     * with `team_lead_id`) and any submission written by another lead, so this
     * screen offered a blank form for a period that was already taken — and the
     * conflict only appeared after the evaluation had been filled in.
     */
    const existingReview = await this.dataSource
      .getRepository(PerformanceReview)
      .findOne({
        where: {
          reviewee: { user_id: employeeId },
          appraisalForm: { form_id: form.form_id },
          review_period: reviewPeriod,
        },
        relations: {
          reviewee: true,
          reviewer: true,
          appraisalForm: true,
          answers: { formQuestion: { question: true }, selectedOption: true },
        },
        order: { created_at: 'DESC' },
      });

    return {
      employeeId,
      employeeName: `${reviewee.first_name} ${reviewee.last_name}`.trim(),
      formId: form.form_id,
      formName: form.form_name,
      evaluationType: form.evaluation_type,
      reviewPeriod,
      questions: questions
        .filter((fq) => this.isLinkActive(fq))
        .map((fq) => this.toFormQuestion(fq)),
      existing: existingReview
        ? this.toSubmittedEvaluation(existingReview)
        : null,
    };
  }

  async submitEvaluation(
    reviewerId: string,
    employeeId: string,
    dto: SubmitEvaluationDto,
  ): Promise<SubmittedEvaluationDto> {
    const reviewId = await this.dataSource.transaction(async (manager) => {
      const reviewRepo = manager.getRepository(PerformanceReview);
      const answerRepo = manager.getRepository(PerformanceReviewAnswer);

      const { reviewer, reviewee } = await this.assertCanReview(
        reviewerId,
        employeeId,
        manager,
      );

      const form = await this.resolveFormForEmployee(employeeId, manager);
      if (!form) {
        throw new BadRequestException(
          'No published appraisal form is assigned to this employee.',
        );
      }

      const formQuestions = await this.loadFormQuestions(manager, form.form_id);
      const fqById = new Map(
        formQuestions.map((fq) => [fq.form_question_id, fq]),
      );

      if (!dto.scores?.length) {
        throw new BadRequestException('At least one score is required.');
      }

      const activeQuestions = formQuestions.filter((fq) =>
        this.isLinkActive(fq),
      );

      // Validate and resolve every submitted answer against its own question's
      // type. Resolution happens here, before anything is written, so a bad
      // answer half way down the list cannot leave a partially scored review.
      const resolved = new Map<string, ResolvedAnswer>();

      for (const score of dto.scores) {
        const fq = fqById.get(score.questionId);
        if (!fq) {
          throw new BadRequestException(
            `Unknown criterion: ${score.questionId}`,
          );
        }
        if (!this.isLinkActive(fq)) {
          throw new BadRequestException(
            `Criterion is not active: ${score.questionId}`,
          );
        }
        if (resolved.has(score.questionId)) {
          throw new BadRequestException(
            `Criterion answered twice: ${this.questionLabel(fq)}`,
          );
        }
        resolved.set(score.questionId, this.resolveAnswer(fq, score));
      }

      // Every required active question must be answered, otherwise the
      // weighted total would silently be computed over a partial form.
      const answered = new Set(dto.scores.map((s) => s.questionId));
      const missing = activeQuestions.filter(
        (fq) => fq.is_required && !answered.has(fq.form_question_id),
      );
      if (missing.length > 0) {
        throw new BadRequestException(
          `Missing scores for: ${missing
            .map((fq) => fq.question?.question_text ?? fq.form_question_id)
            .join(', ')}`,
        );
      }

      // One review per reviewee + form + period. A submitted review is LOCKED:
      // the previous behaviour here silently overwrote it, which meant an
      // approved evaluation could be rewritten after the fact with no trace.
      // Re-submitting now conflicts, and the only way back is an HR reopen —
      // which leaves a REOPEN row in review_approvals.
      //
      // The lookup deliberately does NOT filter on the reviewer, because
      // `UQ_pr_reviewee_form_period` does not either. The scheduler stamps its
      // Drafts with `employee.team_lead_id`, which is not necessarily whoever is
      // submitting now — a second lead, an HR user, or a lead added after the
      // Draft was generated all reach this code. Matching on reviewer as well
      // missed those rows, fell through to the INSERT below, and surfaced the
      // unique-index violation as a raw 500 instead of filling in the Draft.
      let review = await reviewRepo.findOne({
        where: {
          reviewee: { user_id: employeeId },
          appraisalForm: { form_id: form.form_id },
          review_period: dto.reviewPeriod,
        },
        relations: { reviewer: true },
      });

      if (review && LOCKED_REVIEW_STATUSES.includes(review.status)) {
        // Name the reviewer when it was somebody else, so a lead who did not
        // write it is not left thinking the system lost their submission.
        const other =
          review.reviewer && review.reviewer.user_id !== reviewerId
            ? ` by ${
                `${review.reviewer.first_name ?? ''} ${
                  review.reviewer.last_name ?? ''
                }`.trim() || review.reviewer.email
              }`
            : '';
        throw new ConflictException(
          `This evaluation was already submitted${other} for ${dto.reviewPeriod} (status: ${review.status}) and is locked. Ask HR to reopen it before making changes.`,
        );
      }

      const now = new Date();

      if (review) {
        // A Draft review — either auto-generated by the scheduler or reopened by
        // HR. Its answers are replaced wholesale rather than merged, so a
        // question dropped from the payload does not linger with a stale score.
        await answerRepo.delete({ review: { review_id: review.review_id } });
        review.comments = dto.comments;
        review.recommendation = dto.recommendation;
        review.review_date = now;
        review.status = 'Submitted';
        review.submitted_at = now;
        review.locked_at = now;
        review.appraisalForm = form;
        review.evaluation_type = form.evaluation_type;
        /*
         * The reviewer is taken over by whoever actually filled the form in.
         * `assertCanReview` above has already established that this user is
         * allowed to review this employee, and the row can only hold one
         * reviewer — recording the scheduler's guess instead of the person who
         * did the work would misattribute the evaluation.
         */
        review.reviewer = reviewer;
        /*
         * Restamped rather than left alone. A scheduler-generated Draft can sit
         * unanswered while HR publishes a new version of the form; the answers
         * being written now are against the questions loaded above, which are
         * the current version's, so that is the version this review belongs to.
         */
        review.form_version = form.version ?? 1;
        review = await reviewRepo.save(review);
      } else {
        review = reviewRepo.create({
          appraisalForm: form,
          reviewer,
          reviewee,
          evaluation_type: form.evaluation_type,
          review_period: dto.reviewPeriod,
          review_date: now,
          total_score_percentage: 0,
          status: 'Submitted',
          submitted_at: now,
          locked_at: now,
          comments: dto.comments,
          recommendation: dto.recommendation,
          // Lock which version the review was scored against, so editing the form
          // later doesn't silently change what these answers meant.
          form_version: form.version ?? 1,
        });
        try {
          review = await reviewRepo.save(review);
        } catch (error) {
          // The gap between the SELECT above and this INSERT is small but real:
          // the scheduler, or a second lead pressing Submit at the same moment,
          // can land the row in between. That is the index doing its job, so it
          // is reported as the conflict it is rather than a 500.
          if (isUniqueViolation(error)) {
            throw new ConflictException(
              `An evaluation for ${dto.reviewPeriod} was created by someone else while this one was being submitted. Reopen the form to see the current version.`,
            );
          }
          throw error;
        }
      }

      const optionRepo = manager.getRepository(AppraisalQuestionOption);

      for (const [questionId, answer] of resolved) {
        const fq = fqById.get(questionId)!;

        // Only reference an option row that still exists — see ResolvedAnswer.
        const selectedOption = answer.selectedOptionId
          ? ((await optionRepo.findOne({
              where: { option_id: answer.selectedOptionId },
            })) ?? undefined)
          : undefined;

        await answerRepo.save(
          answerRepo.create({
            review,
            formQuestion: fq,
            selectedOption,
            answer_comment: answer.comment,
            // Every type normalises onto 0–100 so aggregates stay comparable
            // across questions using different scales and option sets.
            answered_percentage: answer.percentage,
            is_absent_auto_zero: false,
          }),
        );
      }

      await this.performanceReviewService.recalculateReviewScore(
        review.review_id,
        manager,
      );

      // The approval trail and the audit row commit with the submission itself.
      // Written through the same manager so a failure anywhere in this
      // transaction cannot leave a review that claims to be submitted with no
      // record of who submitted it.
      await manager.getRepository(ReviewApproval).save(
        manager.getRepository(ReviewApproval).create({
          review,
          actor: reviewer,
          action: ReviewApprovalAction.SUBMIT,
          comment: dto.comments || null,
        }),
      );

      await this.audit.record({
        actor: {
          user_id: reviewerId,
          email: reviewer.email,
        },
        action: 'appraisal.review.submit',
        entityType: 'performance_reviews',
        entityId: review.review_id,
        after: {
          status: 'Submitted',
          review_period: dto.reviewPeriod,
          reviewee_id: employeeId,
          form_id: form.form_id,
          answers: resolved.size,
        },
        manager,
      });

      return review.review_id;
    });

    const saved = await this.dataSource
      .getRepository(PerformanceReview)
      .findOne({
        where: { review_id: reviewId },
        relations: {
          reviewee: true,
          reviewer: true,
          appraisalForm: true,
          answers: { formQuestion: { question: true }, selectedOption: true },
        },
      });

    return this.toSubmittedEvaluation(saved!);
  }

  // ==========================================================================
  // EMPLOYEE — own history
  // ==========================================================================

  async getMyEvaluations(employeeId: string): Promise<MyEvaluationsDto> {
    const reviews = await this.dataSource
      .getRepository(PerformanceReview)
      .find({
        /*
         * Submitted and later only — a Draft is not an evaluation yet.
         *
         * The scheduler generates a Draft per employee per period the moment the
         * period opens, scored 0 with no answers. Unfiltered, those placeholders
         * reached the employee's own history: a 0% row for a review nobody had
         * written, pulling `averageScore` down, taking `latestScore` (the sort is
         * newest-first, and the current period's Draft is always newest), and
         * planting a 0 on the trend chart. The employee saw a failing grade for
         * work their lead had not evaluated yet.
         *
         * `LOCKED_REVIEW_STATUSES` is exactly the right set here — a review is
         * locked precisely when it has been submitted, which is when the employee
         * is entitled to see it.
         */
        where: {
          reviewee: { user_id: employeeId },
          status: In(LOCKED_REVIEW_STATUSES),
        },
        relations: {
          reviewee: true,
          reviewer: true,
          appraisalForm: true,
          answers: { formQuestion: { question: true }, selectedOption: true },
        },
        order: { review_date: 'DESC', created_at: 'DESC' },
      });

    const evaluations = reviews.map((r) => this.toSubmittedEvaluation(r));

    const scores = evaluations.map((e) => e.totalScore);
    const average =
      scores.length > 0
        ? this.roundTo2(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    // Category breakdown: mean normalised score per criterion name, across all
    // of this employee's reviews.
    const byCriteria = new Map<
      string,
      { total: number; count: number; weightage: number }
    >();
    for (const evaluation of evaluations) {
      for (const score of evaluation.scores) {
        const key = score.criteriaName || 'Uncategorised';
        const bucket = byCriteria.get(key) ?? {
          total: 0,
          count: 0,
          weightage: score.weightage,
        };
        bucket.total += score.scorePercentage;
        bucket.count += 1;
        bucket.weightage = score.weightage;
        byCriteria.set(key, bucket);
      }
    }

    return {
      evaluations,
      latestScore: evaluations.length > 0 ? evaluations[0].totalScore : null,
      averageScore: average,
      // Oldest → newest, which is the direction a trend chart wants.
      trend: [...evaluations].reverse().map((e) => ({
        period: e.reviewPeriod,
        score: e.totalScore,
        reviewDate: e.reviewDate,
      })),
      categoryBreakdown: [...byCriteria.entries()].map(([name, b]) => ({
        criteriaName: name,
        averageScore: this.roundTo2(b.total / b.count),
        weightage: b.weightage,
      })),
    };
  }

  /**
   * The same per-employee history/breakdown/trend as {@link getMyEvaluations},
   * but for any employee — with a scope check so it cannot be pointed outside
   * the caller's roster.
   *
   * `all` (HR/Admin) is unrestricted. `team`/`self` are confined to the ids the
   * caller can already see, mirroring the Compare guard in AppraisalStatsService
   * — a Team Lead lists and opens only their own team here.
   */
  async getEmployeeEvaluations(
    employeeId: string,
    viewer: { userId: string; scope: 'all' | 'team' | 'self' },
  ): Promise<MyEvaluationsDto> {
    if (viewer.scope !== 'all') {
      const roster = await this.resolveVisibleEmployeeIds(viewer.userId);
      roster.add(viewer.userId);
      if (!roster.has(employeeId)) {
        throw new ForbiddenException(
          'That employee is outside the records you can view.',
        );
      }
    }
    return this.getMyEvaluations(employeeId);
  }

  // ==========================================================================
  // HR — org-wide
  // ==========================================================================

  /**
   * One submitted review, in the same shape the evaluation history uses.
   *
   * Loads the same relations as `getAllEvaluations` so `toSubmittedEvaluation`
   * can resolve every per-question score, its selected option and remarks — the
   * form viewer on the Results tab reads exactly this.
   */
  async getEvaluationById(reviewId: string): Promise<SubmittedEvaluationDto> {
    const review = await this.dataSource
      .getRepository(PerformanceReview)
      .findOne({
        where: { review_id: reviewId },
        relations: {
          reviewee: true,
          reviewer: true,
          appraisalForm: true,
          answers: { formQuestion: { question: true }, selectedOption: true },
        },
      });

    if (!review) throw new NotFoundException('Review not found.');

    return this.toSubmittedEvaluation(review);
  }

  async getAllEvaluations(): Promise<SubmittedEvaluationDto[]> {    const reviews = await this.dataSource
      .getRepository(PerformanceReview)
      .find({
        relations: {
          reviewee: true,
          reviewer: true,
          appraisalForm: true,
          answers: { formQuestion: { question: true }, selectedOption: true },
        },
        order: { review_date: 'DESC', created_at: 'DESC' },
      });

    return reviews.map((r) => this.toSubmittedEvaluation(r));
  }

  async getAnalytics(): Promise<AnalyticsDto> {
    const reviews = await this.dataSource
      .getRepository(PerformanceReview)
      .find({
        relations: {
          reviewee: { department: true, designation: true },
        },
        order: { review_date: 'ASC' },
      });

    const scores = reviews.map((r) => Number(r.total_score_percentage));
    const average =
      scores.length > 0
        ? this.roundTo2(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;

    const group = (
      keyOf: (r: PerformanceReview) => string,
    ): Array<{ name: string; averageScore: number; count: number }> => {
      const buckets = new Map<string, { total: number; count: number }>();
      for (const review of reviews) {
        const key = keyOf(review);
        if (!key) continue;
        const bucket = buckets.get(key) ?? { total: 0, count: 0 };
        bucket.total += Number(review.total_score_percentage);
        bucket.count += 1;
        buckets.set(key, bucket);
      }
      return [...buckets.entries()]
        .map(([name, b]) => ({
          name,
          averageScore: this.roundTo2(b.total / b.count),
          count: b.count,
        }))
        .sort((a, b) => b.averageScore - a.averageScore);
    };

    const trendBuckets = new Map<string, { total: number; count: number }>();
    for (const review of reviews) {
      const key = review.review_period || 'Unknown';
      const bucket = trendBuckets.get(key) ?? { total: 0, count: 0 };
      bucket.total += Number(review.total_score_percentage);
      bucket.count += 1;
      trendBuckets.set(key, bucket);
    }

    return {
      totalEvaluations: reviews.length,
      employeesEvaluated: new Set(
        reviews.map((r) => r.reviewee?.user_id).filter(Boolean),
      ).size,
      averageScore: average,
      distribution: this.toDistribution(scores),
      byDepartment: group((r) => r.reviewee?.department?.department_name ?? ''),
      byDesignation: group((r) => r.reviewee?.designation?.title ?? ''),
      trend: [...trendBuckets.entries()].map(([period, b]) => ({
        period,
        averageScore: this.roundTo2(b.total / b.count),
        count: b.count,
      })),
    };
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async toFormDto(form: AppraisalForms): Promise<FormDto> {
    const [questions, assignments, reviewCount] = await Promise.all([
      this.loadFormQuestions(this.formQuestionRepository.manager, form.form_id),
      /*
       * The rows themselves rather than a count: the forms list shows which
       * departments and designations a form applies to, and deriving those names
       * on the client would mean shipping the whole org chart to render one
       * column.
       */
      this.assignmentRepository.find({
        where: { form: { form_id: form.form_id } },
        relations: { department: true, designation: true },
      }),
      this.dataSource
        .getRepository(PerformanceReview)
        .count({ where: { appraisalForm: { form_id: form.form_id } } }),
    ]);

    const active = questions.filter((fq) => this.isLinkActive(fq));

    const sortNames = (names: string[]) =>
      [...new Set(names)].sort((a, b) => a.localeCompare(b));

    return {
      formId: form.form_id,
      formName: form.form_name,
      description: form.description ?? '',
      evaluationType: form.evaluation_type,
      status: form.status,
      isActive: form.is_active,
      questionCount: questions.length,
      activeWeightTotal: this.roundTo2(
        active.reduce((sum, fq) => sum + Number(fq.weight_percentage || 0), 0),
      ),
      assignmentCount: assignments.length,
      departmentNames: sortNames(
        assignments
          .map((a) => a.department?.department_name)
          .filter((name): name is string => Boolean(name)),
      ),
      designationNames: sortNames(
        assignments
          .map((a) => a.designation?.title)
          .filter((name): name is string => Boolean(name)),
      ),
      reviewCount,
      version: form.version ?? 1,
      createdAt: this.toDateString(form.created_at),
      updatedAt: this.toDateString(form.updated_at),
    };
  }

  /**
   * Snapshot-aware projection of a form link.
   *
   * A published link reads its frozen copy; a Draft link reads the live bank.
   * That single branch is what lets questions be shared across forms without an
   * edit rewriting history: the bank is mutable, the snapshot is not.
   */
  private toFormQuestion(fq: AppraisalFormQuestion): FormQuestionDto {
    const snapshotted = Boolean(fq.snapshot_text);

    const questionText = snapshotted
      ? (fq.snapshot_text ?? '')
      : (fq.question?.question_text ?? '');

    const questionType = snapshotted
      ? (fq.snapshot_type ?? QuestionType.RATING)
      : (fq.question?.question_type ?? QuestionType.RATING);

    const options: FormQuestionOptionDto[] = snapshotted
      ? [...(fq.snapshot_options ?? [])]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((option) => ({
            optionId: option.optionId,
            optionText: option.optionText,
            score: Number(option.score),
            displayOrder: option.displayOrder,
          }))
      : [...(fq.question?.options ?? [])]
          .sort((a, b) => a.display_order - b.display_order)
          .map((option) => ({
            optionId: option.option_id,
            optionText: option.option_text,
            score: Number(option.score),
            displayOrder: option.display_order,
          }));

    return {
      questionId: fq.form_question_id,
      bankQuestionId: fq.question?.question_id ?? '',
      questionText,
      questionType,
      description: snapshotted
        ? (fq.snapshot_description ?? null)
        : (fq.description ?? null),
      weightage: Number(fq.weight_percentage),
      isActive: this.isLinkActive(fq),
      ratingScale: fq.rating_scale ?? 10,
      ratingMin: fq.rating_min ?? 1,
      minLabel: fq.min_label ?? null,
      maxLabel: fq.max_label ?? null,
      displayOrder: fq.display_order,
      isRequired: fq.is_required ?? true,
      options,
      isSnapshotted: snapshotted,
    };
  }

  private toAssignmentDto(a: AppraisalFormAssignment): AssignmentDto {
    if (a.department) {
      return {
        assignmentId: a.assignment_id,
        formId: a.form?.form_id ?? '',
        targetType: 'department',
        targetId: a.department.department_id,
        targetName: a.department.department_name,
      };
    }
    if (a.designation) {
      return {
        assignmentId: a.assignment_id,
        formId: a.form?.form_id ?? '',
        targetType: 'designation',
        targetId: a.designation.designation_id,
        targetName: a.designation.title,
      };
    }
    return {
      assignmentId: a.assignment_id,
      formId: a.form?.form_id ?? '',
      targetType: 'employee',
      targetId: a.user?.user_id ?? '',
      targetName: a.user
        ? `${a.user.first_name} ${a.user.last_name}`.trim()
        : '',
    };
  }

  private toSubmittedEvaluation(
    review: PerformanceReview,
  ): SubmittedEvaluationDto {
    const scores: EvaluationScoreDto[] = (review.answers ?? []).map(
      (answer) => {
        const fq = answer.formQuestion;
        const scale = fq?.rating_scale ?? 10;
        const min = fq?.rating_min ?? 1;
        const percentage = Number(answer.answered_percentage);
        const type = fq ? this.linkType(fq) : QuestionType.RATING;

        return {
          scoreId: answer.answer_id,
          questionId: fq?.form_question_id ?? '',
          criteriaName: fq ? this.questionLabel(fq) : '',
          questionType: type,
          weightage: Number(fq?.weight_percentage ?? 0),
          ratingScale: scale,
          ratingMin: min,
          // Only a rating answer came from a point on a scale, so only a rating
          // answer can be put back onto one. Denormalising an option choice or a
          // comment would invent a number the reviewer never gave.
          score:
            type === QuestionType.RATING
              ? this.roundTo2((percentage / 100) * scale)
              : 0,
          scorePercentage: this.roundTo2(percentage),
          selectedOptionId: answer.selectedOption?.option_id ?? null,
          selectedOptionText: answer.selectedOption?.option_text ?? null,
          remarks: answer.answer_comment ?? null,
        };
      },
    );

    return {
      appraisalId: review.review_id,
      employeeId: review.reviewee?.user_id ?? '',
      employeeName: review.reviewee
        ? `${review.reviewee.first_name} ${review.reviewee.last_name}`.trim()
        : '',
      formId: review.appraisalForm?.form_id ?? '',
      formName: review.appraisalForm?.form_name ?? '',
      evaluationType: review.appraisalForm?.evaluation_type ?? '',
      reviewerName: review.reviewer
        ? `${review.reviewer.first_name} ${review.reviewer.last_name}`.trim()
        : '',
      reviewDate: this.toDateString(review.review_date),
      reviewPeriod: review.review_period,
      totalScore: this.roundTo2(Number(review.total_score_percentage)),
      comments: review.comments ?? '',
      recommendation: review.recommendation ?? '',
      status: review.status,
      scores,
    };
  }

  private toDistribution(
    scores: number[],
  ): Array<{ band: string; count: number }> {
    return SCORE_BANDS.map(({ band, min, max }) => ({
      band,
      count: scores.filter((s) => s >= min && s <= max).length,
    }));
  }

  private toMemberStatus(user: User): 'Active' | 'On Leave' | 'Inactive' {
    if (!user.status) return 'Inactive';
    if ((user.attendance_status ?? '').toLowerCase() === 'on leave') {
      return 'On Leave';
    }
    return 'Active';
  }

  private async loadFormQuestions(
    manager: EntityManager,
    formId: string,
    version?: number,
  ): Promise<AppraisalFormQuestion[]> {
    const form = await manager.getRepository(AppraisalForms).findOne({
      where: { form_id: formId },
      select: { version: true },
    });

    const targetVersion = version ?? form?.version ?? 1;

    return manager.getRepository(AppraisalFormQuestion).find({
      where: {
        appraisalForm: { form_id: formId },
        version: targetVersion,
      },
      // `question.options` is needed for the option-based types; a Draft form
      // renders from it, and publishing copies it into snapshot_options.
      relations: { question: { options: true }, appraisalForm: true },
      order: { display_order: 'ASC' },
    });
  }

  private roundTo2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private toDateString(value: Date | string | null | undefined): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    // TypeORM `date` columns come back as 'YYYY-MM-DD' strings already.
    return String(value).slice(0, 10);
  }

  /** Full timestamp, unlike `toDateString` — used where the time of day matters. */
  private toIsoString(value: Date | string | null | undefined): string {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString();
    return new Date(value).toISOString();
  }

  // ==========================================================================
  // NOTIFICATIONS — own only
  // ==========================================================================

  async getNotifications(userId: string): Promise<
    Array<{
      notificationId: string;
      type: string;
      title: string;
      message: string;
      isRead: boolean;
      relatedReviewId: string | null;
      createdAt: string;
    }>
  > {
    const rows = await this.dataSource
      .getRepository(AppraisalNotification)
      .find({
        where: { recipient: { user_id: userId } },
        relations: { relatedReview: true },
        order: { created_at: 'DESC' },
        take: 100,
      });

    return rows.map((n) => ({
      notificationId: n.notification_id,
      type: n.type,
      title: n.title,
      message: n.message,
      isRead: n.is_read,
      relatedReviewId: n.relatedReview?.review_id ?? null,
      createdAt: n.created_at.toISOString(),
    }));
  }

  async markNotificationRead(
    notificationId: string,
    userId: string,
  ): Promise<{ message: string }> {
    const repo = this.dataSource.getRepository(AppraisalNotification);
    const notification = await repo.findOne({
      where: { notification_id: notificationId },
      relations: { recipient: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    // Enforce ownership: a user cannot mark another user's notification read.
    if (notification.recipient?.user_id !== userId) {
      throw new ForbiddenException('This notification does not belong to you.');
    }

    if (!notification.is_read) {
      await repo.update(notificationId, { is_read: true });
    }

    return { message: 'Notification marked as read.' };
  }

  // ==========================================================================
  // TEAM LEAD DASHBOARD
  // ==========================================================================

  async getTeamLeadDashboard(leadId: string): Promise<{
    pending: number;
    submitted: number;
    approved: number;
    teamSize: number;
    unreadNotifications: number;
    team: TeamMemberDto[];
  }> {
    const [team, notifications] = await Promise.all([
      this.getMyTeam(leadId),
      this.dataSource.getRepository(AppraisalNotification).count({
        where: { recipient: { user_id: leadId }, is_read: false },
      }),
    ]);

    const memberIds = team.map((m) => m.employeeId);

    let pending = 0;
    let submitted = 0;
    let approved = 0;

    if (memberIds.length > 0) {
      const reviews = await this.dataSource
        .getRepository(PerformanceReview)
        .find({
          where: {
            reviewer: { user_id: leadId },
            reviewee: { user_id: In(memberIds) },
          },
          relations: { reviewee: true },
          order: { created_at: 'DESC' },
        });

      // Count only the latest review per reviewee.
      const seen = new Set<string>();
      for (const review of reviews) {
        const id = review.reviewee?.user_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        if (review.status === 'Draft') pending += 1;
        else if (review.status === 'Submitted') submitted += 1;
        else if (review.status === 'Approved') approved += 1;
      }
    }

    return {
      pending,
      submitted,
      approved,
      teamSize: team.length,
      unreadNotifications: notifications,
      team,
    };
  }
}
