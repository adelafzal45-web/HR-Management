import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { PerformanceReviewAnswer } from '../performance-review-answer/performance-review-answer.entity';

@Entity('performance_reviews')
export class PerformanceReview {
  @PrimaryGeneratedColumn('uuid')
  review_id!: string;

  // Employee/Lead who is conducting the review
  @ManyToOne(() => User, (user) => user.reviewsGiven, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'reviewer_id',
  })
  reviewer!: User;

  // Employee who is being evaluated
  @ManyToOne(() => User, (user) => user.reviewsReceived, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'reviewee_id',
  })
  reviewee!: User;

  @Column({
    type: 'varchar',
    length: 50,
  })
  review_period!: string;

  @Column({
    type: 'date',
  })
  review_date!: Date;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  total_score_percentage?: number;

  @Column({
    type: 'text',
    nullable: true,
  })
  comments?: string;

  @OneToMany(
    () => PerformanceReviewAnswer,
    (answer) => answer.review,
    {
      cascade: true,
    },
  )
  answers!: PerformanceReviewAnswer[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}