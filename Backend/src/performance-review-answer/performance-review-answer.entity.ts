import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';

@Entity('performance_review_answers')
export class PerformanceReviewAnswer {
  @PrimaryGeneratedColumn('uuid')
  answer_id!: string;

  // ==========================================
  // Performance Review
  // ==========================================

  @ManyToOne(
    () => PerformanceReview,
    (review) => review.answers,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'review_id',
  })
  review!: PerformanceReview;

  // ==========================================
  // Appraisal Question
  // ==========================================

  @ManyToOne(
    () => AppraisalQuestion,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'question_id',
  })
  question!: AppraisalQuestion;

  // ==========================================
  // Selected Option
  // ==========================================
  // Used for RATING questions.
  // Nullable because COMMENT questions don't
  // necessarily have an option.

  @ManyToOne(
    () => AppraisalQuestionOption,
    {
      nullable: true,
      onDelete: 'SET NULL',
    },
  )
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
    nullable: true,
  })
  answered_percentage?: number;

  // ==========================================
  // Created At
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;
}