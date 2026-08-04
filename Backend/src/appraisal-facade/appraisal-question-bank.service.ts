import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import {
  AppraisalQuestion,
  OPTION_BASED_TYPES,
  QuestionType,
  SCORED_TYPES,
} from '../appraisal-question/appraisal-question.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';
import { FormStatus } from '../appraisal-forms/appraisal-forms.entity';
import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';
import { AuditService, type AuditActor } from '../audit/audit.service';
import {
  paginatedResult,
  type PaginatedResult,
} from '../common/dto/pagination-query.dto';

import {
  BankQuestionQueryDto,
  CreateBankQuestionDto,
  QuestionOptionInputDto,
  UpdateBankQuestionDto,
} from './dto/question-bank.dto';

// ---------------------------------------------------------------------------
// Frontend-facing shapes (camelCase), matching the rest of the facade.
// ---------------------------------------------------------------------------

export interface BankOptionDto {
  optionId: string;
  optionText: string;
  score: number;
  displayOrder: number;
}

export interface BankQuestionDto {
  questionId: string;
  questionText: string;
  questionType: QuestionType;
  isActive: boolean;
  /** True when this type contributes to the weighted score. */
  isScored: boolean;
  options: BankOptionDto[];
  /** How many form links point at this question, across all statuses. */
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionUsageFormDto {
  formId: string;
  formName: string;
  status: string;
  evaluationType: string;
  weightage: number;
  /**
   * True when the link carries a published snapshot, so edits to the bank
   * question do not reach it.
   */
  isSnapshotted: boolean;
}

export interface QuestionUsageDto {
  questionId: string;
  questionText: string;
  totalForms: number;
  /** Forms whose wording is frozen and therefore unaffected by an edit. */
  snapshottedForms: QuestionUsageFormDto[];
  /** Draft forms that WILL pick up an edit immediately. */
  liveForms: QuestionUsageFormDto[];
  /** Answers already recorded against this question, across all reviews. */
  answerCount: number;
}

/** An edit's blast radius, returned so the effect is visible not surprising. */
export interface BankQuestionMutationResult {
  question: BankQuestionDto;
  /** Draft forms that immediately show the new wording. */
  affectedDraftForms: string[];
  /** Published forms left untouched because they hold a snapshot. */
  unaffectedPublishedForms: string[];
}

/** Defaults used when a yes_no question is created without an option list. */
const DEFAULT_YES_NO: Array<{ text: string; score: number }> = [
  { text: 'Yes', score: 10 },
  { text: 'No', score: 0 },
];

/**
 * The reusable question bank.
 *
 * One `appraisal_questions` row may be referenced by many forms — that is what
 * makes questions reusable, and it is also the thing that could quietly rewrite
 * history. The protection is not a ban on editing; it is the publish-time
 * snapshot on `appraisal_form_questions`. A Draft form reads the live bank so
 * HR sees their edits while building; a Published form reads only its frozen
 * copy. Every mutation here therefore reports both sets back to the caller, so
 * "I edited a question, what did that touch" has a visible answer instead of an
 * assumed one.
 *
 * Per-type rules enforced here, not just in the UI:
 *  - `rating`         — no options. The scale lives per form link
 *                       (`rating_scale`), not on the bank question.
 *  - `yes_no`         — exactly two options; auto-created if omitted.
 *  - `multiple_choice`
 *    / `dropdown`     — 2..20 options, each scored. Identical scoring; they
 *                       differ only in how the UI renders them.
 *  - `text_feedback`  — no options, and it cannot carry weight. There is
 *                       nothing to score, so weight on it would shrink the
 *                       scored denominator and inflate every total. That check
 *                       lives at publish time, where weights are known.
 */
@Injectable()
export class AppraisalQuestionBankService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(AppraisalQuestion)
    private readonly questionRepository: Repository<AppraisalQuestion>,

    @InjectRepository(AppraisalQuestionOption)
    private readonly optionRepository: Repository<AppraisalQuestionOption>,

    @InjectRepository(AppraisalFormQuestion)
    private readonly formQuestionRepository: Repository<AppraisalFormQuestion>,

    private readonly audit: AuditService,
  ) {}

  // ==========================================================================
  // READ
  // ==========================================================================

  async list(
    query: BankQuestionQueryDto,
  ): Promise<PaginatedResult<BankQuestionDto>> {
    const qb = this.questionRepository
      .createQueryBuilder('question')
      .leftJoinAndSelect('question.options', 'option');

    if (query.questionType) {
      qb.andWhere('question.question_type = :questionType', {
        questionType: query.questionType,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('question.is_active = :isActive', {
        isActive: query.isActive === 'true' || query.isActive === '1',
      });
    }

    if (query.search) {
      qb.andWhere('question.question_text ILIKE :search', {
        search: `%${query.search}%`,
      });
    }

    /*
     * Whitelisted sort columns. A caller-supplied column name cannot reach the
     * query builder directly — that would be an injection point — and anything
     * unrecognised falls back to newest-first. `usageCount` is deliberately
     * absent: it is counted in a second query after pagination, so there is no
     * column here to order by.
     */
    const SORTABLE: Record<string, string> = {
      questionText: 'question.question_text',
      questionType: 'question.question_type',
      isActive: 'question.is_active',
      createdAt: 'question.created_at',
      updatedAt: 'question.updated_at',
    };
    const sortColumn = SORTABLE[query.sortBy ?? ''] ?? 'question.created_at';

    // Paginating a left-joined one-to-many needs skip/take (two queries), not
    // offset/limit — the latter would slice the joined rows and truncate the
    // option list of whichever question straddles the page boundary.
    const [questions, total] = await qb
      .orderBy(sortColumn, query.order)
      .addOrderBy('option.display_order', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    const usage = await this.countUsage(questions.map((q) => q.question_id));

    return paginatedResult(
      questions.map((q) => this.toDto(q, usage.get(q.question_id) ?? 0)),
      total,
      query,
    );
  }

  async findOne(questionId: string): Promise<BankQuestionDto> {
    const question = await this.loadQuestion(questionId);
    const usage = await this.countUsage([questionId]);
    return this.toDto(question, usage.get(questionId) ?? 0);
  }

  /**
   * Which forms reference this question, split by whether they hold a
   * snapshot. This is what makes "is it safe to edit" answerable before the
   * edit rather than after it.
   */
  async getUsage(questionId: string): Promise<QuestionUsageDto> {
    const question = await this.loadQuestion(questionId);

    const links = await this.formQuestionRepository.find({
      where: { question: { question_id: questionId } },
      relations: { appraisalForm: true },
      order: { created_at: 'ASC' },
    });

    const snapshotted: QuestionUsageFormDto[] = [];
    const live: QuestionUsageFormDto[] = [];

    for (const link of links) {
      const entry: QuestionUsageFormDto = {
        formId: link.appraisalForm?.form_id ?? '',
        formName: link.appraisalForm?.form_name ?? '',
        status: link.appraisalForm?.status ?? '',
        evaluationType: link.appraisalForm?.evaluation_type ?? '',
        weightage: Number(link.weight_percentage ?? 0),
        isSnapshotted: Boolean(link.snapshot_text),
      };
      (entry.isSnapshotted ? snapshotted : live).push(entry);
    }

    const answerCount =
      links.length === 0
        ? 0
        : await this.dataSource
            .getRepository(PerformanceReviewAnswer)
            .createQueryBuilder('answer')
            .innerJoin('answer.formQuestion', 'formQuestion')
            .where('formQuestion.question_id = :questionId', { questionId })
            .getCount();

    return {
      questionId,
      questionText: question.question_text,
      totalForms: links.length,
      snapshottedForms: snapshotted,
      liveForms: live,
      answerCount,
    };
  }

  // ==========================================================================
  // WRITE
  // ==========================================================================

  async create(
    dto: CreateBankQuestionDto,
    actor: AuditActor,
  ): Promise<BankQuestionMutationResult> {
    const text = dto.questionText.trim();
    if (!text) {
      throw new BadRequestException('Question text is required.');
    }

    const options = this.resolveOptions(dto.questionType, dto.options);

    const questionId = await this.dataSource.transaction(async (manager) => {
      const questionRepo = manager.getRepository(AppraisalQuestion);

      const saved = await questionRepo.save(
        questionRepo.create({
          question_text: text,
          question_type: dto.questionType,
          is_active: dto.isActive ?? true,
        }),
      );

      await this.writeOptions(manager, saved.question_id, options);

      await this.audit.record({
        actor,
        action: 'appraisal.question.create',
        entityType: 'appraisal_questions',
        entityId: saved.question_id,
        after: {
          question_text: text,
          question_type: dto.questionType,
          option_count: options.length,
        },
        manager,
      });

      return saved.question_id;
    });

    return this.toMutationResult(questionId);
  }

  async update(
    questionId: string,
    dto: UpdateBankQuestionDto,
    actor: AuditActor,
  ): Promise<BankQuestionMutationResult> {
    const existing = await this.loadQuestion(questionId);

    const nextType = dto.questionType ?? existing.question_type;

    if (dto.questionType && dto.questionType !== existing.question_type) {
      // Changing the type would leave recorded answers describing a question
      // that no longer exists in that shape: a stored `selected_option_id`
      // against a question that is now `rating` has no meaning, and the
      // percentage it produced cannot be recomputed. Refused rather than
      // migrated, because there is no correct migration.
      const answerCount = await this.countAnswers(questionId);
      if (answerCount > 0) {
        throw new ConflictException(
          `This question already has ${answerCount} recorded answer(s), so its type cannot be changed from "${existing.question_type}" to "${dto.questionType}". Create a new question instead.`,
        );
      }
    }

    // An explicit `options: []` on an option-based type is a real edit, not an
    // omission, so `resolveOptions` sees it and rejects it. `undefined` means
    // "leave the option list alone".
    const optionsProvided = dto.options !== undefined;
    const options = optionsProvided
      ? this.resolveOptions(nextType, dto.options)
      : this.resolveOptions(
          nextType,
          dto.questionType && dto.questionType !== existing.question_type
            ? undefined
            : (existing.options ?? []).map((option) => ({
                optionId: option.option_id,
                optionText: option.option_text,
                score: Number(option.score),
                displayOrder: option.display_order,
              })),
        );

    const before = {
      question_text: existing.question_text,
      question_type: existing.question_type,
      is_active: existing.is_active,
      option_count: existing.options?.length ?? 0,
    };

    await this.dataSource.transaction(async (manager) => {
      const questionRepo = manager.getRepository(AppraisalQuestion);

      const question = await questionRepo.findOne({
        where: { question_id: questionId },
      });
      if (!question) {
        throw new NotFoundException('Question not found');
      }

      if (dto.questionText !== undefined) {
        const text = dto.questionText.trim();
        if (!text) {
          throw new BadRequestException('Question text cannot be empty.');
        }
        question.question_text = text;
      }
      if (dto.questionType !== undefined) {
        question.question_type = dto.questionType;
      }
      if (dto.isActive !== undefined) {
        question.is_active = dto.isActive;
      }

      await questionRepo.save(question);

      if (optionsProvided || nextType !== existing.question_type) {
        await this.writeOptions(manager, questionId, options);
      }

      await this.audit.record({
        actor,
        action: 'appraisal.question.update',
        entityType: 'appraisal_questions',
        entityId: questionId,
        before,
        after: {
          question_text: question.question_text,
          question_type: question.question_type,
          is_active: question.is_active,
          option_count: options.length,
        },
        manager,
      });
    });

    return this.toMutationResult(questionId);
  }

  /**
   * Removes a question from the bank, or deactivates it when history depends
   * on it.
   *
   * A question with recorded answers is never deleted: the answers carry the
   * percentage but the question carries what was asked, and dropping it would
   * turn every historical review into a list of unlabelled numbers. Same
   * reasoning as the deactivate-rather-than-delete path in
   * `AppraisalFacadeService.saveFormQuestions`.
   */
  async remove(
    questionId: string,
    actor: AuditActor,
  ): Promise<{ deleted: boolean; message: string }> {
    const question = await this.loadQuestion(questionId);

    const [answerCount, linkCount] = await Promise.all([
      this.countAnswers(questionId),
      this.formQuestionRepository.count({
        where: { question: { question_id: questionId } },
      }),
    ]);

    if (answerCount > 0 || linkCount > 0) {
      if (!question.is_active) {
        return {
          deleted: false,
          message: `Question is already inactive — it is used by ${linkCount} form(s) and has ${answerCount} recorded answer(s), so it cannot be deleted.`,
        };
      }

      question.is_active = false;
      await this.questionRepository.save(question);

      await this.audit.record({
        actor,
        action: 'appraisal.question.deactivate',
        entityType: 'appraisal_questions',
        entityId: questionId,
        before: { is_active: true },
        after: { is_active: false, forms: linkCount, answers: answerCount },
      });

      return {
        deleted: false,
        message: `Question deactivated — ${linkCount} form(s) and ${answerCount} answer(s) reference it, so it cannot be deleted.`,
      };
    }

    await this.questionRepository.remove(question);

    await this.audit.record({
      actor,
      action: 'appraisal.question.delete',
      entityType: 'appraisal_questions',
      entityId: questionId,
      before: {
        question_text: question.question_text,
        question_type: question.question_type,
      },
    });

    return { deleted: true, message: 'Question deleted.' };
  }

  // ==========================================================================
  // Shared validation — also called by the facade when it links a question.
  // ==========================================================================

  /**
   * Normalises and validates an option list against its question type.
   *
   * Returns the list that should be persisted, so callers never have to
   * reproduce the yes/no defaulting or the ordering rules.
   */
  resolveOptions(
    type: QuestionType,
    input?: QuestionOptionInputDto[],
  ): Array<{ optionText: string; score: number; displayOrder: number }> {
    const isOptionBased = OPTION_BASED_TYPES.includes(type);

    if (!isOptionBased) {
      if (input && input.length > 0) {
        throw new BadRequestException(
          `A "${type}" question does not take an option list.`,
        );
      }
      return [];
    }

    let entries = (input ?? []).filter((option) => option.optionText?.trim());

    if (type === QuestionType.YES_NO) {
      if (entries.length === 0) {
        entries = DEFAULT_YES_NO.map((option, index) => ({
          optionText: option.text,
          score: option.score,
          displayOrder: index + 1,
        }));
      } else if (entries.length !== 2) {
        throw new BadRequestException(
          `A "yes_no" question must have exactly two options (received ${entries.length}). Omit the list to use Yes / No.`,
        );
      }
    } else if (entries.length < 2) {
      throw new BadRequestException(
        `A "${type}" question needs at least two options (received ${entries.length}).`,
      );
    }

    const seen = new Set<string>();
    for (const option of entries) {
      const key = option.optionText.trim().toLowerCase();
      if (seen.has(key)) {
        throw new BadRequestException(
          `Duplicate option "${option.optionText.trim()}". Each option must be distinct.`,
        );
      }
      seen.add(key);
    }

    // At least one option has to be worth something. An all-zero list would
    // make every answer score 0% while looking like a scored question, and the
    // normaliser at submit time would be dividing by zero.
    const maxScore = Math.max(...entries.map((option) => Number(option.score)));
    if (!(maxScore > 0)) {
      throw new BadRequestException(
        'At least one option must have a score above zero.',
      );
    }

    return entries.map((option, index) => ({
      optionText: option.optionText.trim(),
      score: Math.round(Number(option.score) * 100) / 100,
      displayOrder: option.displayOrder ?? index + 1,
    }));
  }

  /**
   * Validates an option list against its type and persists it, inside a caller's
   * transaction.
   *
   * Exposed for the form builder's inline-question path, so the per-type rules
   * live in exactly one place rather than being reimplemented by the facade.
   */
  async syncOptions(
    manager: EntityManager,
    questionId: string,
    type: QuestionType,
    input?: QuestionOptionInputDto[],
  ): Promise<void> {
    await this.writeOptions(
      manager,
      questionId,
      this.resolveOptions(type, input),
    );
  }

  /** How many form links point at a question, within a caller's transaction. */
  countLinks(manager: EntityManager, questionId: string): Promise<number> {
    return manager
      .getRepository(AppraisalFormQuestion)
      .count({ where: { question: { question_id: questionId } } });
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private async loadQuestion(questionId: string): Promise<AppraisalQuestion> {
    const question = await this.questionRepository.findOne({
      where: { question_id: questionId },
      relations: { options: true },
    });
    if (!question) {
      throw new NotFoundException('Question not found');
    }
    question.options = this.sortOptions(question.options);
    return question;
  }

  private sortOptions(
    options?: AppraisalQuestionOption[],
  ): AppraisalQuestionOption[] {
    return [...(options ?? [])].sort(
      (a, b) => a.display_order - b.display_order,
    );
  }

  private countAnswers(questionId: string): Promise<number> {
    return this.dataSource
      .getRepository(PerformanceReviewAnswer)
      .createQueryBuilder('answer')
      .innerJoin('answer.formQuestion', 'formQuestion')
      .where('formQuestion.question_id = :questionId', { questionId })
      .getCount();
  }

  /** form-link counts keyed by question id, in one query. */
  private async countUsage(
    questionIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (questionIds.length === 0) {
      return counts;
    }

    const rows: Array<{ question_id: string; count: string }> =
      await this.formQuestionRepository
        .createQueryBuilder('formQuestion')
        .select('formQuestion.question_id', 'question_id')
        .addSelect('COUNT(*)', 'count')
        .where('formQuestion.question_id IN (:...questionIds)', { questionIds })
        .groupBy('formQuestion.question_id')
        .getRawMany();

    for (const row of rows) {
      counts.set(row.question_id, Number(row.count));
    }
    return counts;
  }

  /**
   * Replaces a question's option list.
   *
   * Delete-then-insert rather than a per-row diff. Options are only referenced
   * by `performance_review_answers.selected_option_id`, which is `ON DELETE SET
   * NULL` — but a question that already has answers cannot reach here, because
   * `update` refuses a type change in that case and the answer count guard
   * above covers the rest. Within a transaction, readers see the old list or
   * the new one, never a partial one.
   */
  private async writeOptions(
    manager: EntityManager,
    questionId: string,
    options: Array<{ optionText: string; score: number; displayOrder: number }>,
  ): Promise<void> {
    const optionRepo = manager.getRepository(AppraisalQuestionOption);

    await optionRepo.delete({ question: { question_id: questionId } });

    if (options.length === 0) {
      return;
    }

    const question = await manager
      .getRepository(AppraisalQuestion)
      .findOne({ where: { question_id: questionId } });
    if (!question) {
      throw new NotFoundException('Question not found');
    }

    await optionRepo.save(
      options.map((option) =>
        optionRepo.create({
          question,
          option_text: option.optionText,
          score: option.score,
          display_order: option.displayOrder,
        }),
      ),
    );
  }

  /** Re-reads the question and reports which forms an edit reached. */
  private async toMutationResult(
    questionId: string,
  ): Promise<BankQuestionMutationResult> {
    const [question, usage] = await Promise.all([
      this.loadQuestion(questionId),
      this.getUsage(questionId),
    ]);

    return {
      question: this.toDto(question, usage.totalForms),
      affectedDraftForms: usage.liveForms
        .filter((form) => form.status === FormStatus.DRAFT)
        .map((form) => form.formName),
      unaffectedPublishedForms: usage.snapshottedForms
        .filter((form) => form.status !== FormStatus.DRAFT)
        .map((form) => form.formName),
    };
  }

  private toDto(
    question: AppraisalQuestion,
    usageCount: number,
  ): BankQuestionDto {
    return {
      questionId: question.question_id,
      questionText: question.question_text,
      questionType: question.question_type,
      isActive: question.is_active,
      isScored: SCORED_TYPES.includes(question.question_type),
      options: this.sortOptions(question.options).map((option) => ({
        optionId: option.option_id,
        optionText: option.option_text,
        score: Number(option.score),
        displayOrder: option.display_order,
      })),
      usageCount,
      createdAt: question.created_at?.toISOString() ?? '',
      updatedAt: question.updated_at?.toISOString() ?? '',
    };
  }
}
