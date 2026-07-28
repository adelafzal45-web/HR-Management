import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

@Entity('appraisal_question_weights')
export class AppraisalQuestionWeight {
  @PrimaryGeneratedColumn('uuid')
  weight_id!: string;

  // ==========================================
  // Question
  // One Weight -> One Question
  // ==========================================

  @OneToOne(
    () => AppraisalQuestion,
    (question) => question.weight,
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
  // Weight
  // ==========================================

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  weight_percentage!: number;
}