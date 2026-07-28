import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalQuestionOption } from '../apprisal-question-options/apprisal-question-options.entity';
import { AppraisalQuestionWeight } from '../apprisal-question-weight/apprisal-question-weight.entity';

@Entity('appraisal_questions')
export class AppraisalQuestion {
  @PrimaryGeneratedColumn('uuid')
  question_id!: string;

  // ==========================================
  // Question Creator
  // ==========================================

  @ManyToOne(() => User, (user) => user.appraisalQuestions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'created_by',
  })
  createdBy!: User;

  // ==========================================
  // Question Details
  // ==========================================

  @Column({
    type: 'text',
  })
  question_text!: string;

  @Column({
    type: 'varchar',
    length: 30,
  })
  question_type!: string;

  @Column({
    type: 'boolean',
    default: true,
  })
  is_active!: boolean;

  // ==========================================
  // Question Options
  // One Question -> Many Options
  // ==========================================

  @OneToMany(
    () => AppraisalQuestionOption,
    (option) => option.question,
    {
      cascade: true,
    },
  )
  options!: AppraisalQuestionOption[];

  // ==========================================
  // Question Weight
  // One Question -> One Weight
  // ==========================================

  @OneToOne(
    () => AppraisalQuestionWeight,
    (weight) => weight.question,
    {
      cascade: true,
    },
  )
  weight!: AppraisalQuestionWeight;

  // ==========================================
  // Performance Reviews
  // ==========================================

 
  performanceReviews!: PerformanceReview[];

  // ==========================================
  // Timestamps
  // ==========================================

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}