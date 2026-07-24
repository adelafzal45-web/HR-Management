import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { PerformanceReview } from '../performance-review/performance-review.entity';

@Entity('appraisal_questions')
export class AppraisalQuestion {
  @PrimaryGeneratedColumn('uuid')
  question_id!: string;

  @ManyToOne(() => User, (user) => user.appraisalQuestions, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @Column({
    type: 'text',
  })
  question_text!: string;

  @Column({
    length: 30,
  })
  question_type!: string;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
  })
  weight!: number;

  @Column({
    default: true,
  })
  is_active!: boolean;

  @OneToMany(
    () => PerformanceReview,
    (performanceReview) => performanceReview.appraisalQuestion,
  )
  performanceReviews!: PerformanceReview[];

  @CreateDateColumn()
  created_at!: Date;
}
