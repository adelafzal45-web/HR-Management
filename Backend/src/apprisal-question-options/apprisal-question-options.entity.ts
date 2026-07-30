import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

@Entity('appraisal_question_options')
export class AppraisalQuestionOption {
  @PrimaryGeneratedColumn('uuid')
  option_id!: string;

  // ==========================================
  // Question
  // Many Options -> One Question
  // ==========================================

  @ManyToOne(() => AppraisalQuestion, (question) => question.options, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'question_id',
  })
  question!: AppraisalQuestion;

  // ==========================================
  // Option Details
  // ==========================================

  @Column({
    type: 'text',
  })
  option_text!: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  score!: number;

  @Column({
    type: 'int',
  })
  display_order!: number;
}
