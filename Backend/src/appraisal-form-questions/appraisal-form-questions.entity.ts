import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { AppraisalForms } from '../appraisal-forms/appraisal-forms.entity';
import {
  AppraisalQuestion,
  QuestionType,
} from '../appraisal-question/appraisal-question.entity';

/** One frozen option inside `snapshot_options`. */
export type QuestionOptionSnapshot = {
  optionId: string;
  optionText: string;
  score: number;
  displayOrder: number;
};

@Entity('appraisal_form_questions')
export class AppraisalFormQuestion {
  @PrimaryGeneratedColumn('uuid')
  form_question_id!: string;

  @ManyToOne(() => AppraisalForms, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'form_id',
  })
  appraisalForm!: AppraisalForms;

  @ManyToOne(() => AppraisalQuestion, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'question_id',
  })
  question!: AppraisalQuestion;

  @Column({
    type: 'int',
    default: 1,
  })
  display_order!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  weight_percentage!: number;

  @Column({
    default: true,
  })
  is_required!: boolean;

  /**
   * Optional helper text shown under the question title.
   *
   * Per form link rather than per bank question on purpose: the same reusable
   * question can need different framing on a Daily engineering form than on a
   * Monthly sales one, and the bank exists to share the wording, not the
   * context.
   */
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  description?: string | null;

  /**
   * Is this question live on THIS form.
   *
   * Distinct from `AppraisalQuestion.is_active`, which says whether the bank
   * still offers the question at all. They separated when questions became
   * reusable: dropping a question from one form must not drop it from every
   * other form referencing the same bank row — least of all a published form,
   * whose weights would stop totalling 100%.
   *
   * Set to false rather than deleting the row whenever answers already exist,
   * because `performance_review_answers.form_question_id` is ON DELETE CASCADE
   * and removing the link would take the history with it.
   */
  @Column({
    default: true,
  })
  is_active!: boolean;

  // ==========================================
  // Versioning
  //
  // Which form version this question snapshot belongs to. Multiple snapshots of
  // the same question can exist with different versions, so when a published form
  // is edited its old questions stay for old reviews while new rows hold the
  // latest version.
  // ==========================================

  @Column({
    type: 'int',
    default: 1,
  })
  version!: number;

  // ==========================================
  // Rating scale
  // The reviewer rates this question from 1..rating_scale. Stored per question
  // so HR can mix (e.g. a 1–5 behavioural item next to a 1–10 delivery item).
  // Answers are persisted normalised as a percentage, so changing the scale
  // never invalidates historical scores.
  // ==========================================

  @Column({
    type: 'int',
    default: 10,
  })
  rating_scale!: number;

  /** Optional anchor shown under the low end of the scale, e.g. "Needs work". */
  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  min_label?: string | null;

  /** Optional anchor shown under the high end, e.g. "Consistently exceeds". */
  @Column({
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  max_label?: string | null;

  // ==========================================
  // Published snapshot
  //
  // Questions live in a shared bank and may be referenced by many forms. That
  // is what makes them reusable — and what would otherwise let an edit to one
  // form's question silently rewrite the wording of every other form using it,
  // including forms already published and already answered.
  //
  // Publishing freezes the question here. A Draft form reads the live bank, so
  // HR sees their edits while building. A Published form reads only these
  // columns, so neither the form nor the reviews submitted against it can
  // change underneath. Cleared if the form ever returns to Draft.
  // ==========================================

  @Column({
    type: 'text',
    nullable: true,
  })
  snapshot_text?: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  snapshot_type?: QuestionType | null;

  /** Frozen copy of `description`, so a later edit cannot reword live history. */
  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  snapshot_description?: string | null;

  /**
   * Frozen copy of the option list at publish time, as
   * `{optionId, optionText, score, displayOrder}[]`. Stored as jsonb rather
   * than copied rows because these are read-only history: nothing joins to
   * them, and duplicating them into `appraisal_question_options` would make
   * the bank's own option list ambiguous.
   */
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  snapshot_options?: QuestionOptionSnapshot[] | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
