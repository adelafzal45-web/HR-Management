import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { AppraisalQuestion } from '../appraisal-question/appraisal-question.entity';

@Entity('performance_reviews')
export class PerformanceReview {
  @PrimaryGeneratedColumn('uuid')
  review_id!: string;

  @ManyToOne(() => User, (user) => user.performanceReviews, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
  })
  user!: User;

  @ManyToOne(
    () => AppraisalQuestion,
    (appraisalQuestion) => appraisalQuestion.performanceReviews,
    {
      nullable: false,
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'question_id',
  })
  appraisalQuestion!: AppraisalQuestion;

  @Column({
    length: 50,
  })
  review_period!: string;

  @Column({
    type: 'decimal',
    precision: 3,
    scale: 2,
  })
  rating!: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  comments?: string;

  @Column({
    type: 'date',
  })
  review_date!: Date;
}
