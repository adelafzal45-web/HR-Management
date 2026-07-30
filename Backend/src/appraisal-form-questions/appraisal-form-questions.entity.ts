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
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

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

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
