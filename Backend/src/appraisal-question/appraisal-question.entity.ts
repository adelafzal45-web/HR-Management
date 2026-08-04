import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';

/**
 * The five supported question types.
 *
 * `rating`        — 1..rating_scale, scale configured per form question.
 * `yes_no`        — exactly two options.
 * `multiple_choice` / `dropdown` — two or more scored options; identical
 *                   scoring, they differ only in how the UI renders them.
 * `text_feedback` — free text. Carries no score and therefore no weight;
 *                   see AppraisalQuestionBankService for why.
 *
 * The database CHECK constraint `CHK_aq_question_type` is the authority. This
 * enum exists so callers do not pass string literals around.
 */
export enum QuestionType {
  RATING = 'rating',
  YES_NO = 'yes_no',
  MULTIPLE_CHOICE = 'multiple_choice',
  DROPDOWN = 'dropdown',
  TEXT_FEEDBACK = 'text_feedback',
}

/** Types whose answers come from a fixed option list. */
export const OPTION_BASED_TYPES: readonly QuestionType[] = [
  QuestionType.YES_NO,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.DROPDOWN,
];

/** Types that contribute a score, and so may carry weight. */
export const SCORED_TYPES: readonly QuestionType[] = [
  QuestionType.RATING,
  QuestionType.YES_NO,
  QuestionType.MULTIPLE_CHOICE,
  QuestionType.DROPDOWN,
];

export function isQuestionType(value: string): value is QuestionType {
  return (Object.values(QuestionType) as string[]).includes(value);
}

@Entity('appraisal_questions')
export class AppraisalQuestion {
  @PrimaryGeneratedColumn('uuid')
  question_id!: string;

  // ==========================================
  // Question Details
  // ==========================================

  @Column({
    type: 'text',
  })
  question_text!: string;

  /**
   * One of `QuestionType`. Kept as a varchar rather than a Postgres enum so
   * adding a type later is an ALTER on a CHECK constraint instead of an enum
   * type migration, which cannot run inside a transaction on older servers.
   */
  @Column({
    type: 'varchar',
    length: 30,
    default: QuestionType.RATING,
  })
  question_type!: QuestionType;

  @Column({
    type: 'boolean',
    default: true,
  })
  is_active!: boolean;

  // ==========================================
  // Question Options
  // ==========================================

  @OneToMany(() => AppraisalQuestionOption, (option) => option.question, {
    cascade: true,
  })
  options!: AppraisalQuestionOption[];

  // ==========================================
  // Appraisal Form Questions
  // ==========================================

  @OneToMany(
    () => AppraisalFormQuestion,
    (formQuestion) => formQuestion.question,
  )
  formQuestions!: AppraisalFormQuestion[];

  // ==========================================
  // Timestamps
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
