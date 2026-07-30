import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';

@Entity('performance_review_answers')
export class PerformanceReviewAnswer {
  @PrimaryGeneratedColumn('uuid')
  answer_id!: string;

  // ==========================================
  // Performance Review
  // ==========================================

  @ManyToOne(() => PerformanceReview, (review) => review.answers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'review_id',
  })
  review!: PerformanceReview;

  // ==========================================
  // Appraisal Form Question
  // ==========================================

  @ManyToOne(() => AppraisalFormQuestion, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'form_question_id',
  })
  formQuestion!: AppraisalFormQuestion;

  // ==========================================
  // Selected Option
  // ==========================================

  @ManyToOne(() => AppraisalQuestionOption, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'selected_option_id',
  })
  selectedOption?: AppraisalQuestionOption;

  // ==========================================
  // Comment Answer
  // ==========================================

  @Column({
    type: 'text',
    nullable: true,
  })
  answer_comment?: string;

  // ==========================================
  // Calculated Percentage
  // ==========================================

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
  })
  answered_percentage!: number;

  // ==========================================
  // Auto Zero on Absence
  // ==========================================

  @Column({
    default: false,
  })
  is_absent_auto_zero!: boolean;

  // ==========================================
  // Timestamps
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
