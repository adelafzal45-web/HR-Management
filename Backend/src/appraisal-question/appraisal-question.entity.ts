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
