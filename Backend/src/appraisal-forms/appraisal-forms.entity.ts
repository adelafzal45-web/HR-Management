import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { PerformanceReview } from '../performance-review/performance-review.entity';
import { AppraisalFormQuestion } from '../appraisal-form-questions/appraisal-form-questions.entity';

export enum EvaluationType {
  DAILY = 'Daily',
  WEEKLY = 'Weekly',
  MONTHLY = 'Monthly',
}

@Entity('appraisal_forms')
export class AppraisalForms {
  @PrimaryGeneratedColumn('uuid')
  form_id!: string;

  @Column({
    unique: true,
    length: 150,
  })
  form_name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description?: string;

  @Column({
    type: 'enum',
    enum: EvaluationType,
  })
  evaluation_type!: EvaluationType;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'Draft',
  })
  status!: string;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  department_id?: string;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  designation_id?: string;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  created_by?: string;

  @Column({
    default: true,
  })
  is_active!: boolean;

  // ==========================================
  // Performance Reviews
  // ==========================================

  @OneToMany(() => PerformanceReview, (review) => review.appraisalForm)
  performanceReviews!: PerformanceReview[];

  // ==========================================
  // Appraisal Form Questions
  // ==========================================

  @OneToMany(
    () => AppraisalFormQuestion,
    (formQuestion) => formQuestion.appraisalForm,
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
